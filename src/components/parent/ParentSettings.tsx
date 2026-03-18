import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase'; // needed to get the token

export const ParentSettings: React.FC = () => {
    const { t } = useTranslation();
    const { user, userData, loading, signInWithGoogle, logout } = useAuth();
    const [isUpdating, setIsUpdating] = useState(false);
    const [minutes, setMinutes] = useState(userData?.snsRewardMinutes || 60);

    if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#7f8c8d' }}>{t('parentSettings.processing')}</div>;

    if (!user || !userData) {
        return (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#2c3e50' }}>{t('parentSettings.title')}</h2>
                <button
                    onClick={signInWithGoogle}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 24px', backgroundColor: 'white', border: '1px solid #dadce0', borderRadius: '8px', fontSize: '15px', fontWeight: '600', color: '#3c4043', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px', height: '20px' }} />
                    {t('parentSettings.signIn')}
                </button>
            </div>
        );
    }

    const handleSubscribe = async () => {
        try {
            setIsUpdating(true);
            const token = await auth.currentUser?.getIdToken();
            const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3003'}/api/create-checkout-session`;
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ baseUrl })
            });
            const data = await response.json();
            if (data.url) window.location.href = data.url;
        } catch (error) {
            console.error('Subscription error:', error);
            alert('エラーが発生しました');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleManageSubscription = async () => {
        try {
            setIsUpdating(true);
            const token = await auth.currentUser?.getIdToken();
            const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3003'}/api/create-portal-session`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.url) window.location.href = data.url;
        } catch (error) {
            console.error('Portal session error:', error);
            alert('エラーが発生しました');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleUpdateMinutes = async () => {
        try {
            setIsUpdating(true);
            const token = await auth.currentUser?.getIdToken();
            const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3003'}/api/update-sns-time`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ snsRewardMinutes: minutes })
            });
            if (response.ok) {
                alert(`設定を ${minutes} 分に更新しました`);
            } else {
                alert('設定の更新に失敗しました');
            }
        } catch (error) {
            console.error('Update error:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div style={{ padding: '24px', width: '100%', maxWidth: '32rem', margin: '0 auto', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', border: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Header Area */}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>✨</span>
                    <h2 style={{ fontSize: '24px', fontWeight: '900', background: 'linear-gradient(to right, #f59e0b, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {t('parentSettings.title')}
                    </h2>
                </div>
                <button
                    onClick={logout}
                    style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '500', transition: 'color 0.2s', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#4b5563'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                >
                    {t('parentSettings.logout')}
                </button>
            </div>

            {/* Account Info Card */}
            <div style={{ width: '100%', backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', marginBottom: '32px', border: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <p style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700', marginBottom: '4px' }}>{t('parentSettings.account')}</p>
                    <p style={{ fontWeight: '600', color: '#1f2937' }}>{userData.email}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700', marginBottom: '4px' }}>{t('parentSettings.currentPlan')}</p>
                    {userData.isPremium ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 12px', borderRadius: '9999px', border: '1px solid #d1fae5' }}>
                            <span style={{ fontSize: '14px' }}>👑</span>
                            <span style={{ fontWeight: '700', fontSize: '14px' }}>{t('parentSettings.premium')}</span>
                        </div>
                    ) : (
                        <div style={{ display: 'inline-block', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '4px 12px', borderRadius: '9999px', border: '1px solid #e5e7eb' }}>
                            <span style={{ fontWeight: '700', fontSize: '14px' }}>{t('parentSettings.free')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Premium Benefits & CTA */}
            {!userData.isPremium ? (
                <div style={{ width: '100%' }}>
                    <div style={{ background: 'linear-gradient(to bottom right, #fffbeb, #fff7ed)', borderRadius: '16px', padding: '24px', border: '1px solid #fef3c7', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, marginTop: '-16px', marginRight: '-16px', color: '#f59e0b', opacity: 0.1 }}>
                            <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                        </div>

                        <h3 style={{ fontWeight: '700', color: '#1f2937', fontSize: '18px', marginBottom: '16px', textAlign: 'center', position: 'relative', zIndex: 10 }}>
                            {t('parentSettings.premiumTitle')}
                        </h3>
                        <ul style={{ listStyleType: 'none', padding: 0, margin: 0, marginBottom: '32px', position: 'relative', zIndex: 10 }}>
                            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                                <span style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }}>⏱️</span>
                                <div>
                                    <p style={{ fontWeight: '700', color: '#1f2937', fontSize: '14px', margin: 0 }}>{t('parentSettings.snsTimeFeature')}</p>
                                    <p style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px', margin: 0 }}>{t('parentSettings.snsTimeDesc')}</p>
                                </div>
                            </li>
                        </ul>

                        <div style={{ position: 'relative', zIndex: 10 }}>
                            <button
                                onClick={handleSubscribe}
                                disabled={isUpdating}
                                style={{ width: '100%', position: 'relative', overflow: 'hidden', background: 'linear-gradient(to right, #f59e0b, #f97316)', color: 'white', padding: '16px', borderRadius: '12px', fontWeight: '700', border: 'none', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.5 : 1, boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.3), 0 4px 6px -2px rgba(245, 158, 11, 0.15)', transition: 'all 0.3s' }}
                                onMouseOver={(e) => { if (!isUpdating) e.currentTarget.style.transform = 'translateY(-2px)' }}
                                onMouseOut={(e) => { if (!isUpdating) e.currentTarget.style.transform = 'translateY(0)' }}
                            >
                                <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.2)', transition: 'background-color 0.3s' }}></div>
                                <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    {isUpdating ? t('parentSettings.processing') : <><span>{t('parentSettings.startPremium')}</span><span style={{ fontSize: '20px' }}>➔</span></>}
                                </span>
                            </button>
                            <p style={{ textAlign: 'center', fontSize: '10px', color: '#9ca3af', marginTop: '12px' }}>
                                {t('parentSettings.stripeNote')}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ width: '100%', textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#d1fae5', color: '#10b981', fontSize: '40px', marginBottom: '16px' }}>
                        🎉
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>
                        {t('parentSettings.premiumActive')}
                    </h3>
                    <p style={{ color: '#6b7280', fontSize: '14px', maxWidth: '320px', margin: '0 auto', marginBottom: '24px' }}>
                        {t('parentSettings.premiumActiveDesc')}
                    </p>

                    <div style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', fontSize: '14px', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '24px' }}>
                        <span style={{ fontSize: '20px' }}>💡</span>
                        <p style={{ margin: 0 }}>{t('parentSettings.snsHint')}</p>
                    </div>

                    <button
                        onClick={handleManageSubscription}
                        disabled={isUpdating}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', fontSize: '14px', fontWeight: '600', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.5 : 1 }}
                    >
                        {isUpdating ? t('parentSettings.processing') : t('parentSettings.managePlan')}
                    </button>
                </div>
            )}
        </div>
    );
};
