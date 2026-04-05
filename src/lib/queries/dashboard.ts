import { getTasksByOrg } from "./tasks";
import { getProjectByOrg } from "./projects";
import { getMembersByOrg } from "./members";
import { Task } from "@/types/task";
import { Project } from "@/types/project";
import { Member } from "@/types/member";

export interface DashboardRawData {
  tasks: Task[];
  project: Project | null;
  members: Member[];
}

export async function getDashboardData(orgId: string): Promise<DashboardRawData> {
  const [tasks, project, members] = await Promise.all([
    getTasksByOrg(orgId),
    getProjectByOrg(orgId),
    getMembersByOrg(orgId),
  ]);

  return { tasks, project, members };
}
