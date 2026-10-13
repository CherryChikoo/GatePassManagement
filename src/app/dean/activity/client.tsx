"use client";

import React from "react";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

interface DeanActivityClientProps {
  user: any;
  permissions?: any[];
  facultyPermissions?: any[];
  facultyMovements?: any[];
  studentMovements?: any[];
  selectedDate: string;
}

export function DeanActivityClient({
  user,
  permissions = [],
  facultyPermissions = [],
  facultyMovements = [],
  studentMovements = [],
  selectedDate,
}: DeanActivityClientProps) {
  return (
    <ExecutiveActivityClient
      role="DEAN"
      user={user}
      permissions={permissions}
      facultyPermissions={facultyPermissions}
      facultyMovements={facultyMovements}
      studentMovements={studentMovements}
      selectedDate={selectedDate}
    />
  );
}
