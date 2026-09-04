import React from "react";
import OrganiserHeader from "@/components/layout/OrganiserHeader";
import { TableRowSkeleton } from "@/components/ui/Skeleton";

export default function OrganiserCategoriesLoading() {
  return (
    <>
      <OrganiserHeader title="Categories" />
      
      <div className="p-margin-desktop space-y-8 bg-surface pb-24 w-full">
        {/* Header Block */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary">Division Management</h2>
            <p className="text-body-sm text-on-surface-variant">View categories and matches for this tournament.</p>
          </div>
        </div>

        {/* Categories Table Skeletons */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Name</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Age</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant">Weight</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-center">Athletes</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-center">Expected Matches</th>
                <th className="px-6 py-4 font-label-caps text-label-caps text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm divide-y divide-outline-variant">
              <TableRowSkeleton cols={6} />
              <TableRowSkeleton cols={6} />
              <TableRowSkeleton cols={6} />
              <TableRowSkeleton cols={6} />
              <TableRowSkeleton cols={6} />
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
