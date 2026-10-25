"use client";

import React from "react";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

interface DeanActivityClientProps {
  user: any;
  /** Day from the address (?date=), else today */
  initialDate?: string;
}

export function DeanActivityClient({ user, initialDate }: DeanActivityClientProps) {
  return <ExecutiveActivityClient role="DEAN" user={user} initialDate={initialDate} />;
}
