import React from 'react';
import DebugView from './DebugView';

const AdminDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-[1760px] mx-auto pt-8 px-4 sm:px-8 lg:px-10 xl:px-12 pb-20">
        <DebugView />
      </div>
    </div>
  );
};

export default AdminDashboard;
