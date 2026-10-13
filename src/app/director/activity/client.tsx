"use client";

import React from "react";
import { ExecutiveActivityClient } from "@/components/dashboard/executive-activity-client";

interface DirectorActivityClientProps {
  user: any;
  permissions?: any[];
  facultyPermissions?: any[];
  facultyMovements?: any[];
  studentMovements?: any[];
  selectedDate: string;
}

export function DirectorActivityClient({
  user,
  permissions = [],
  facultyPermissions = [],
  facultyMovements = [],
  studentMovements = [],
  selectedDate,
}: DirectorActivityClientProps) {
  return (
    <ExecutiveActivityClient
      role="DIRECTOR"
      user={user}
      permissions={permissions}
      facultyPermissions={facultyPermissions}
      facultyMovements={facultyMovements}
      studentMovements={studentMovements}
      selectedDate={selectedDate}
    />
  );
}
