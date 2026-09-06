"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, MonitorSmartphone } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import {
  notificationAccess,
  requestDesktopNotifications,
  showDesktopNotification,
  type NotificationAccess,
} from "@/lib/notifications/desktop";
import { disablePush, enablePush, pushConfigured, pushSupported } from "@/lib/notifications/push";
import {
  registerPushTokenAction,
  unregisterPushTokenAction,
} from "@/app/actions/notifications";
import {
  DashboardCard,
  CardHeader,
  StatusChip,
} from "@/components/dashboard/dashboard-card";
import {
  FormNotice,
  SettingsButton,
  SettingsList,
  ToggleRow,
} from "./settings-primitives";

/* ------------------------------------------------------------------ */
/*  This device                                                        */
/*                                                                     */
/*  The one settings card whose answers belong to the BROWSER rather   */
/*  than to the account. Everything else on this screen is a field on  */
/*  the user document and follows you to your phone; a notification    */
/*  permission and a push registration do not, and pretending          */
/*  otherwise would show a laptop's answer on a phone that never       */
/*  agreed to anything.                                                */
/*                                                                     */
/*  Two rungs, and they are not the same feature:                      */
/*                                                                     */
/*  DESKTOP NOTIFICATIONS work while a tab is open — including a tab   */
/*  in the background, which is the case they exist for. No service    */
/*  worker, nothing stored on the server.                              */
/*                                                                     */
/*  PUSH works while the browser is CLOSED. It costs a service worker  */
/*  and a token stored against your account, so it is opt-in, off by   */
/*  default, and per device.                                           */
/*                                                                     */
/*  Both permission prompts are wired to a real click. A browser       */
/*  refuses a request made on page load and can hold that against the  */
/*  origin permanently, so the button IS the gesture.                  */
/* ------------------------------------------------------------------ */

const ACCESS_NOTE: Record<NotificationAccess, string | null> = {
  granted: null,
  default: "Your browser has not been asked yet.",
  denied:
    "Your browser is blocking notifications for OrbitOS. Allow them from the icon in the address bar to switch this back on.",
  unsupported: "This browser cannot show desktop notifications.",
};

export function DeviceNotificationsCard() {
  const { preferences, update, pending } = usePreferences();

  const [access, setAccess] = useState<NotificationAccess>("unsupported");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /* Read the browser once mounted, never during render: `Notification`
     does not exist on the server, and a value read during render would
     make the first paint disagree with the second. */
  useEffect(() => {
    setAccess(notificationAccess());

    let cancelled = false;
    void (async () => {
      const supported = (await pushSupported()) && pushConfigured();
      if (cancelled) return;
      setPushAvailable(supported);
      if (!supported) return;

      /* Whether THIS browser is registered, inferred rather than
         stored. A granted permission plus a live worker registration is
         what a registered device looks like; asking the SDK for the
         token instead would be exact, and would also mint one on a
         device that had never opted in. If this proves optimistic — the
         registration survived but the token did not — the first send
         fails once and `deadTokenIndexes` clears the row. */
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (cancelled) return;
      setPushOn(Notification.permission === "granted" && Boolean(registration?.active));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const askForAccess = useCallback(async () => {
    const next = await requestDesktopNotifications();
    setAccess(next);

    if (next === "granted") {
      /* Proof, and the only honest kind: if this card appears, the
         wiring works and a real call will raise one too. */
      showDesktopNotification({
        title: "OrbitOS notifications are on",
        body: "This is what an incoming call will look like.",
        tag: "orbit-notification-test",
      });
    }
  }, []);

  const togglePush = useCallback(
    async (next: boolean) => {
      setPushBusy(true);
      setNotice(null);

      try {
        if (next) {
          const result = await enablePush();
          if (!result.ok) {
            setNotice(result.message);
            /* A push permission prompt is the same browser permission
               the row above reports, so a refusal here has to be
               reflected there too. */
            setAccess(notificationAccess());
            return;
          }

          const saved = await registerPushTokenAction({ token: result.token });
          if (!saved.success) {
            setNotice(saved.error);
            return;
          }

          setPushOn(true);
          setAccess(notificationAccess());
          setNotice("This device will ring even when OrbitOS is closed.");
          return;
        }

        /* Read the token before deleting it at the browser — afterwards
           there is nothing left to tell the server to forget. */
        const token = await disablePush();
        if (token) await unregisterPushTokenAction({ token });
        setPushOn(false);
        setNotice("This device will no longer ring while OrbitOS is closed.");
      } finally {
        setPushBusy(false);
      }
    },
    []
  );

  const accessNote = ACCESS_NOTE[access];

  return (
    <DashboardCard interactive={false}>
      <CardHeader
        title="This device"
        icon={MonitorSmartphone}
        meta={
          <StatusChip
            label={access === "granted" ? "Allowed" : "Not allowed"}
            tone={access === "granted" ? "positive" : "neutral"}
          />
        }
      />

      <SettingsList>
        <ToggleRow
          id="pref-desktop-notifications"
          title="Desktop notifications"
          description="A notification when a colleague calls and OrbitOS is open but not the window you are looking at. Nothing appears while you are already on this tab — the call is on screen there."
          checked={preferences.desktopNotifications && access === "granted"}
          busy={pending === "desktopNotifications"}
          disabled={access === "denied" || access === "unsupported"}
          onChange={(next) => {
            /* Switching it on with no permission yet asks for it, which
               is the only moment a browser will honour the request. */
            if (next && access !== "granted") void askForAccess();
            void update({ desktopNotifications: next });
          }}
        />

        {pushAvailable && (
          <ToggleRow
            id="pref-push-notifications"
            title="Ring this device when OrbitOS is closed"
            description="Registers this browser so an incoming call reaches you with no OrbitOS tab open. Set per device — turning it on here does nothing for your phone."
            checked={pushOn}
            busy={pushBusy}
            disabled={access === "denied"}
            onChange={(next) => void togglePush(next)}
          />
        )}
      </SettingsList>

      {/* A block the browser put in place is an error the reader has to
          go and undo; "not asked yet" is just the state of things, and
          painting it red would make an ordinary first visit look
          broken. */}
      {accessNote &&
        (access === "denied" ? (
          <FormNotice tone="error">{accessNote}</FormNotice>
        ) : (
          <p className="mt-4 text-[12px] font-light leading-relaxed text-ink-dim">
            {accessNote}
          </p>
        ))}

      {notice && <FormNotice tone="success">{notice}</FormNotice>}

      {access === "default" && (
        <div className="mt-4">
          <SettingsButton variant="quiet" icon={BellRing} onClick={() => void askForAccess()}>
            Allow notifications
          </SettingsButton>
        </div>
      )}
    </DashboardCard>
  );
}
