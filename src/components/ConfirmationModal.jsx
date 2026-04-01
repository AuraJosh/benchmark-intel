import React from 'react';
import { X, AlertTriangle, Info, Trash2, Archive, CheckCircle2 } from 'lucide-react';

const ConfirmationModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title = "Confirm Action", 
    message = "Are you sure you want to proceed?", 
    confirmText = "Confirm", 
    cancelText = "Cancel", 
    type = "warning",
    loading = false 
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger': return <Trash2 className="h-6 w-6 text-red-600" />;
            case 'warning': return <AlertTriangle className="h-6 w-6 text-amber-600" />;
            case 'archive': return <Archive className="h-6 w-6 text-amber-600" />;
            case 'success': return <CheckCircle2 className="h-6 w-6 text-green-600" />;
            default: return <Info className="h-6 w-6 text-blue-600" />;
        }
    };

    const getTypeStyles = () => {
        switch (type) {
            case 'danger': return 'bg-red-600 hover:bg-red-700 text-white';
            case 'warning': return 'bg-amber-600 hover:bg-amber-700 text-white';
            case 'archive': return 'bg-amber-600 hover:bg-amber-700 text-white';
            case 'success': return 'bg-green-600 hover:bg-green-700 text-white';
            default: return 'bg-[#0f172a] hover:bg-black text-white';
        }
    };

    const getIconBgStyles = () => {
        switch (type) {
            case 'danger': return 'bg-red-100';
            case 'warning': return 'bg-amber-100';
            case 'archive': return 'bg-amber-100';
            case 'success': return 'bg-green-100';
            default: return 'bg-blue-100';
        }
    };

    return (
        <div className="fixed inset-0 z-[200] overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
                <div 
                    className="fixed inset-0 bg-gray-500/30 backdrop-blur-sm transition-opacity" 
                    onClick={onClose}
                ></div>

                <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className={`mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10 ${getIconBgStyles()}`}>
                                {getIcon()}
                            </div>
                            <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                                <h3 className="text-lg font-bold leading-6 text-gray-900" id="modal-title">
                                    {title}
                                </h3>
                                <div className="mt-2">
                                    <p className="text-sm text-gray-500 leading-relaxed">
                                        {message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-4 py-4 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={loading}
                            className={`inline-flex w-full justify-center rounded-lg px-6 py-2.5 text-sm font-bold shadow-sm sm:w-auto transition-all disabled:opacity-50 ${getTypeStyles()}`}
                        >
                            {loading ? (
                                <div className="flex items-center gap-2">
                                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Processing...
                                </div>
                            ) : confirmText}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-all"
                        >
                            {cancelText}
                        </button>
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
