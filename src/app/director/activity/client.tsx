"use client";

import React from "react";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

interface DirectorActivityClientProps {
  user: any;
  /** Day from the address (?date=), else today */
  initialDate?: string;
}

export function DirectorActivityClient({ user, initialDate }: DirectorActivityClientProps) {
  return <ExecutiveActivityClient role="DIRECTOR" user={user} initialDate={initialDate} />;
}
