import React from 'react';

const StatusBadge = ({ status, className = "" }) => {
  const getStatusStyles = (status) => {
    const s = (status || 'New').toLowerCase();
    
    switch (s) {
      case 'won':
      case 'completed':
      case 'active':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'paid':
        return 'border-purple-200 bg-purple-50 text-purple-700';
      case 'quoted':
      case 'contacted':
        return 'border-blue-200 bg-blue-50 text-blue-700';
      case 'archive':
      case 'dead':
      case 'inactive':
        return 'border-gray-200 bg-gray-50 text-gray-700';
      case 'letter dropped':
      case 'letter posted':
        return 'border-pink-200 bg-pink-50 text-pink-700';
      case 'pack created':
        return 'border-teal-200 bg-teal-50 text-teal-700';
      case 'pack required':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'revisit':
        return 'border-orange-200 bg-orange-50 text-orange-700';
      case 'new':
      case 'pending':
        return 'border-sky-200 bg-sky-50 text-sky-700';
      case 'assigned':
        return 'border-violet-200 bg-violet-50 text-violet-700';
      case 'available':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'unavailable':
        return 'border-gray-200 bg-gray-50 text-gray-700';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-700';
    }
  };

  const getDotColor = (status) => {
    const s = (status || 'New').toLowerCase();
    switch (s) {
      case 'won':
      case 'completed':
      case 'active':
      case 'available':
        return 'bg-emerald-500';
      case 'paid': return 'bg-purple-500';
      case 'quoted':
      case 'contacted':
        return 'bg-blue-500';
      case 'archive':
      case 'dead':
      case 'inactive':
      case 'unavailable':
        return 'bg-gray-400';
      case 'letter dropped':
      case 'letter posted': return 'bg-pink-500';
      case 'pack created': return 'bg-teal-500';
      case 'pack required': return 'bg-amber-500';
      case 'revisit': return 'bg-orange-500';
      case 'new':
      case 'pending':
        return 'bg-sky-500';
      case 'assigned': return 'bg-violet-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border whitespace-nowrap shadow-sm transition-all hover:brightness-95 ${getStatusStyles(status)} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${getDotColor(status)} shadow-sm`}></span>
      {status || 'New'}
    </span>
  );
};

export default StatusBadge;
