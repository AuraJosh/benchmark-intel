import { useEffect, useState } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { auth, db } from '../firebase';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';

const NotificationManager = ({ vapidKey }) => {
    const [permissionStatus, setPermissionStatus] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
    );

    useEffect(() => {
        if (!vapidKey) return;

        const setupNotifications = async () => {
            try {
                if (typeof window === 'undefined' || !('Notification' in window)) {
                    console.log('Notifications not supported');
                    return;
                }

                // 1. Request/Check Permission
                const permission = await Notification.requestPermission();
                setPermissionStatus(permission);
                console.log('Notification permission:', permission);

                if (permission === 'granted') {
                    const messaging = getMessaging();
                    
                    // 2. Get Token
                    const token = await getToken(messaging, { 
                        vapidKey: vapidKey 
                    });

                    if (token) {
                        console.log('✅ FCM Token Saved to device:', token);
                        
                        // 3. Save to User Profile in Firestore
                        if (auth.currentUser) {
                            const userRef = doc(db, 'staff_profiles', auth.currentUser.uid);
                            await setDoc(userRef, {
                                fcmTokens: arrayUnion(token),
                                notificationsEnabled: true,
                                lastUpdated: new Date()
                            }, { merge: true });
                            console.log('✅ Token successfully registered in Firestore for user:', auth.currentUser.uid);
                        } else {
                            console.warn('⚠️ No user logged in, cannot save token to DB yet.');
                        }
                    }
                }
            } catch (err) {
                console.error('❌ Error setting up notifications:', err);
            }
        };

        // Run setup when auth is ready
        const unsubAuth = auth.onAuthStateChanged((user) => {
            if (user) {
                setupNotifications();
            }
        });

        // 4. Handle foreground messages
        const messaging = getMessaging();
        const unsubscribeMsg = onMessage(messaging, (payload) => {
            console.log('Message received in foreground: ', payload);
            // On iPhone foreground, we can just show a subtle alert or let the dashboard update
        });

        return () => {
            unsubAuth();
            unsubscribeMsg();
        };
    }, [vapidKey]);

    return null;
};

export default NotificationManager;
