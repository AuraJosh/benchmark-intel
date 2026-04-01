import { Mic, Square, X, Loader2 } from 'lucide-react';
import { useRecording } from '../context/RecordingContext';

const AudioRecorder = () => {
    const { isRecording, recordingState, activeContact, duration, stopRecording, cancelRecording } = useRecording();

    if (recordingState === 'idle') return null;

    const formatDuration = (sec) => {
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed bottom-6 right-6 z-[999] animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-[#0f172a] text-white rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex items-center p-4 gap-4 pr-6">
                {/* Status Indicator */}
                <div className="relative flex items-center justify-center">
                    {recordingState === 'recording' && (
                        <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-25" />
                    )}
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${recordingState === 'recording' ? 'bg-red-500' : 'bg-gray-600'}`}>
                        {recordingState === 'uploading' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Mic className="h-5 w-5 text-white" />
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="space-y-1 min-w-[120px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {recordingState === 'recording' ? 'Recording Call' : recordingState === 'uploading' ? 'Saving Call...' : 'Call Recorded'}
                    </p>
                    <p className="text-sm font-bold truncate max-w-[180px]">
                        {activeContact?.name || 'Unknown Contact'}
                    </p>
                    <p className="text-xs font-mono text-gray-300 font-bold tracking-widest">
                        {formatDuration(duration)}
                    </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                    {recordingState === 'recording' && (
                        <button 
                            onClick={stopRecording}
                            className="h-10 w-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl transition-all group"
                            title="Finish and Save"
                        >
                            <Square className="h-4 w-4 text-white group-hover:scale-110 transition-transform" />
                        </button>
                    )}
                    
                    <button 
                        onClick={() => {
                            if (recordingState === 'recording') {
                                if (window.confirm("Cancel this recording? It will not be saved.")) {
                                    cancelRecording();
                                }
                            } else {
                                cancelRecording();
                            }
                        }}
                        className="h-10 w-10 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-all group"
                        title={recordingState === 'recording' ? "Cancel Recording" : "Close"}
                    >
                        <X className="h-4 w-4 text-red-400 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AudioRecorder;
