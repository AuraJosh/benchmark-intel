import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const RecordingContext = createContext();

export const useRecording = () => useContext(RecordingContext);

export const RecordingProvider = ({ children }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingState, setRecordingState] = useState('idle'); // idle, recording, stopped, uploading
    const [activeContact, setActiveContact] = useState(null); // { id, name, mode }
    const [duration, setDuration] = useState(0);
    
    // Refs for closure access
    const activeContactRef = useRef(null);
    const durationRef = useRef(0);

    
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRecording = async (contact) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                await handleUpload(blob);
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingState('recording');
            setActiveContact(contact);
            activeContactRef.current = contact;
            setDuration(0);
            durationRef.current = 0;

            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    durationRef.current = prev + 1;
                    return prev + 1;
                });
            }, 1000);

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
            setRecordingState('stopped');
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleUpload = async (blob) => {
        const contact = activeContactRef.current;
        const currentDuration = durationRef.current;
        if (!contact) return;
        setRecordingState('uploading');

        try {
            const fileName = `recordings/${contact.id}/${Date.now()}.webm`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);

            // Create correspondence entry
            const payload = {
                category: 'Call',
                notes: `Recorded call with ${contact.name}.`,
                timestamp: serverTimestamp(),
                mode: contact.mode,
                recordingUrl: downloadURL,
                recordingDuration: currentDuration,
                subject: 'Call Recording'
            };

            if (contact.mode === 'homeowner') {
                payload.projectId = contact.id;
            } else {
                payload.builderId = contact.id;
            }

            await addDoc(collection(db, 'correspondence'), payload);
            setRecordingState('idle');
            setActiveContact(null);
            activeContactRef.current = null;
            setDuration(0);
            durationRef.current = 0;
        } catch (err) {
            console.error("Error uploading recording:", err);
            alert("Failed to save recording.");
            setRecordingState('idle');
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        setIsRecording(false);
        setRecordingState('idle');
        setActiveContact(null);
        activeContactRef.current = null;
        setDuration(0);
        durationRef.current = 0;
        if (timerRef.current) clearInterval(timerRef.current);
    };

    return (
        <RecordingContext.Provider value={{
            isRecording,
            recordingState,
            activeContact,
            duration,
            startRecording,
            stopRecording,
            cancelRecording
        }}>
            {children}
        </RecordingContext.Provider>
    );
};
