import React from "react";
import OrganiserHeader from "@/components/layout/OrganiserHeader";
import { TableRowSkeleton } from "@/components/ui/Skeleton";

export default function OrganiserAthletesLoading() {
  return (
    <>
      <OrganiserHeader title="Students Roster" />
      
      <div className="p-margin-desktop space-y-8 bg-surface pb-24 w-full">
        {/* Header Block */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary">Student Roster</h2>
            <p className="text-body-sm text-on-surface-variant">View registered students and category assignments.</p>
          </div>
        </div>

        {/* Filters Shell */}
        <div className="flex gap-4 mb-4 select-none pointer-events-none opacity-60">
          <input 
            type="text" 
            placeholder="Search by name or chest no..."
            disabled
            className="flex-1 bg-white border border-outline-variant rounded p-2 text-sm outline-none"
          />
          <select 
            disabled
            className="w-64 bg-white border border-outline-variant rounded p-2 text-sm outline-none"
          >
            <option>All Categories</option>
          </select>
        </div>

        {/* Students Table Skeletons */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant w-32">Chest No.</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Name</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Category</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant">
              <TableRowSkeleton cols={4} />
              <TableRowSkeleton cols={4} />
              <TableRowSkeleton cols={4} />
              <TableRowSkeleton cols={4} />
              <TableRowSkeleton cols={4} />
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
