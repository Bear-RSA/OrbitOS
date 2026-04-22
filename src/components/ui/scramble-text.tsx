"use client";

import { useEffect, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";

interface ScrambleTextProps {
  text: string;
  speed?: number;
  scrambleSpeed?: number;
}

export function ScrambleText({ text, speed = 1/3, scrambleSpeed = 30 }: ScrambleTextProps) {
  const [display, setDisplay] = useState("");
  
  useEffect(() => {
    let iteration = 0;
    let interval: NodeJS.Timeout;
    
    interval = setInterval(() => {
      setDisplay(text.split("").map((letter, index) => {
        if (index < iteration) {
          return text[index];
        }
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      }).join(""));
      
      if (iteration >= text.length) {
        clearInterval(interval);
      }
      iteration += speed;
    }, scrambleSpeed);
    
    return () => clearInterval(interval);
  }, [text, speed, scrambleSpeed]);
  
  return <>{display}</>;
}
