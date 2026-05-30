"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  Shield,
  Smartphone, 
  Wifi, 
  Bell, 
  BellOff, 
  Copy, 
  Check, 
  Cpu, 
  Radio, 
  Compass, 
  AlertTriangle,
  RotateCw,
  ArrowLeft,
  Menu,
  X,
  Home,
  Terminal,
  HelpCircle,
  FileText,
  Info,
  MapPin
} from "lucide-react";
import Link from "next/link";
import { messaging, db } from "@/lib/firebase";

export default function SimulatorPage() {
  const [permission, setPermission] = useState<string>("default");
  const [fcmToken, setFcmToken] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [simulatedAlert, setSimulatedAlert] = useState<any>(null);
  const [deviceLogs, setDeviceLogs] = useState<string[]>([]);
  const [simulatedIncomingAlert, setSimulatedIncomingAlert] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportText, setReportText] = useState("");
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("home");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [locationText, setLocationText] = useState<string>("Mencari lokasi...");
  const [latLngText, setLatLngText] = useState<string>("LAT: -, LON: -");
  const [locationState, setLocationState] = useState<"loading" | "found" | "not_found" | "denied">("loading");

  // Poll live clock and geo coordinates
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("id-ID", { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setLatLngText(`LAT: ${lat.toFixed(4)}, LON: ${lon.toFixed(4)}`);
          
          // Reverse geocoding via Nominatim API (OpenStreetMap)
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`)
            .then((res) => res.json())
            .then((data) => {
              const address = data.address || {};
              const road = address.road || address.pedestrian || address.suburb || address.village || "";
              const suburb = address.suburb || address.village || address.city_district || address.city || address.county || "";
              if (road || suburb) {
                const formatted = [
                  road ? `Jl. ${road}` : "",
                  suburb ? suburb : ""
                ].filter(Boolean).join(", ");
                setLocationText(formatted);
                setLocationState("found");
              } else {
                setLocationText("Lokasi tidak ditemukan");
                setLocationState("not_found");
              }
            })
            .catch((err) => {
              console.error("Nominatim reverse geocode failed:", err);
              setLocationText("Lokasi tidak ditemukan");
              setLocationState("not_found");
            });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setLocationText("Ijinkan Akses Lokasi");
            setLocationState("denied");
          } else {
            setLocationText("Lokasi tidak ditemukan");
            setLocationState("not_found");
          }
          setLatLngText("LAT: -7.3683, LON: 109.9764");
        }
      );
    } else {
      setLocationText("Lokasi tidak ditemukan");
      setLocationState("not_found");
      setLatLngText("LAT: -7.3683, LON: 109.9764");
    }

    return () => clearInterval(interval);
  }, []);

  // Check initial permission
  useEffect(() => {
    if (typeof window !== "undefined") {
      if ("Notification" in window) {
        setPermission(Notification.permission);
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/firebase-messaging-sw.js")
          .then((reg) => {
            addDeviceLog("LAPANG SDK: Service Worker terdaftar.");
            console.log("Service Worker registered successfully:", reg);
          })
          .catch((err) => {
            addDeviceLog("WARN: Gagal mendaftarkan Service Worker.");
            console.error("Service Worker registration failed:", err);
          });
      }
    }
    addDeviceLog("Sistem Operasi Seluler: Inisialisasi...");
    addDeviceLog("LAPANG SDK: FlashZeroService aktif di latar belakang.");
  }, []);

  // Listen for simulated notifications
  useEffect(() => {
    if (typeof window !== "undefined") {
      const handleFcm = (e: Event) => {
        const alertData = (e as CustomEvent).detail;
        
        // Save the alert data into simulatedAlert (so the ledger/view updates)
        setSimulatedAlert(alertData);

        // Strict Timestamp Validation Barrier: 10 seconds threshold
        let isBrandNew = true;
        if (alertData.timestamps?.created_at) {
          const createdAtTime = new Date(alertData.timestamps.created_at).getTime();
          const nowTime = new Date().getTime();
          const diffMs = Math.abs(nowTime - createdAtTime);
          if (diffMs > 10000) {
            isBrandNew = false;
          }
        }

        if (isBrandNew) {
          setSimulatedIncomingAlert(true);
          addDeviceLog(`[ALERT RECEIVER] FCM High-Priority Diterima (BARU): ${alertData.victim_info.name}`);
          
          // Play emergency siren sound
          try {
            new Audio('/alert.aac').play()
              .then(() => addDeviceLog("TELEMETRI AUDIO: Sirine darurat diputar!"))
              .catch(err => {
                console.warn("Audio play blocked by browser autoplay policy:", err);
                addDeviceLog("TELEMETRI AUDIO: Sirine diblokir oleh kebijakan browser.");
              });
          } catch (audioErr) {
            console.error("Audio playback error:", audioErr);
          }

          // Try trigger native notification
          if (Notification.permission === "granted") {
            if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
              navigator.serviceWorker.ready
                .then((registration) => {
                  registration.showNotification("SIAGA 1: Penculikan Anak!", {
                    body: alertData.ai_summary,
                    icon: "/favicon.ico",
                    badge: "/favicon.ico",
                    tag: alertData.internal_case_id,
                    requireInteraction: true,
                    vibrate: [500, 100, 500, 100, 500],
                    actions: [
                      { action: "view", title: "LIHAT DETAIL KASUS" }
                    ],
                    renotify: true
                  } as any);
                })
                .catch(() => {
                  try {
                    new Notification("SIAGA 1: Penculikan Anak!", {
                      body: alertData.ai_summary,
                      icon: "/favicon.ico",
                      tag: alertData.internal_case_id,
                      requireInteraction: true
                    });
                  } catch (err) {
                    console.warn("Failed to construct Notification fallback:", err);
                  }
                });
            } else {
              try {
                new Notification("SIAGA 1: Penculikan Anak!", {
                  body: alertData.ai_summary,
                  icon: "/favicon.ico",
                  tag: alertData.internal_case_id,
                  requireInteraction: true
                });
              } catch (err) {
                console.warn("Failed to construct Notification:", err);
              }
            }
          }
        } else {
          // Silent append to active tracking ledger table
          addDeviceLog(`[ALERT RECEIVER] Data Historis Diarsip secara Senyap: ${alertData.victim_info.name}`);
        }
      };

      window.addEventListener("lapang-fcm-received", handleFcm);
      return () => window.removeEventListener("lapang-fcm-received", handleFcm);
    }
  }, []);

  // Poll for new alerts from the Next.js API Bridge
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    let lastAlertId: string | null = null;
    
    const pollAlerts = async () => {
      try {
        const res = await fetch("/api/device-token");
        if (res.ok) {
          const data = await res.json();
          if (data.alert && data.alert.internal_case_id !== lastAlertId) {
            lastAlertId = data.alert.internal_case_id;
            window.dispatchEvent(new CustomEvent("lapang-fcm-received", { detail: data.alert }));
          }
        }
      } catch (err) {
        // Silent fail on polling error
      }
    };
    
    const interval = setInterval(pollAlerts, 4000);
    return () => clearInterval(interval);
  }, []);

  const addDeviceLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDeviceLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 10));
  };

  const handleRequestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      addDeviceLog("ERROR: Browser tidak mendukung Notifikasi Web.");
      return;
    }

    if (!window.isSecureContext) {
      addDeviceLog("ERROR: Sistem membutuhkan Secure Context (HTTPS).");
      return;
    }

    setIsRegistering(true);
    addDeviceLog("Mengajukan izin Notifikasi OS...");

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      addDeviceLog(`Status Izin: ${perm.toUpperCase()}`);

      if (perm === "granted") {
        addDeviceLog("Mengambil Token Registrasi FCM dari Google Server...");
        
        if (messaging) {
          try {
            // Lazy load functions from firebase/messaging
            const { getToken } = await import("firebase/messaging");
            
            // Standard Web Push FCM VAPID Key can be registered here if available
            const token = await getToken(messaging, {
              vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
            });
            
            if (token) {
              setFcmToken(token);
              addDeviceLog("SUKSES: Token FCM asli berhasil didapatkan.");
              db.registerSimulatorToken(token);
            } else {
              throw new Error("No token returned");
            }
          } catch (tokenErr: any) {
            console.error("[LAPANG SDK] FCM getToken failed! Check if firebase-messaging-sw.js is properly registered and accessible:", tokenErr);
            addDeviceLog("ERROR: Gagal registrasi FCM. Cek konsol browser.");
            generateSimulatedToken();
          }
        } else {
          // If native messaging instance is not initialized (no credentials)
          generateSimulatedToken();
        }
      } else {
        addDeviceLog("WARN: Izin ditolak. Token tidak dapat diambil.");
      }
    } catch (err: any) {
      addDeviceLog(`ERROR: Gagal registrasi token (${err.message})`);
      generateSimulatedToken();
    } finally {
      setIsRegistering(false);
    }
  };

  const generateSimulatedToken = () => {
    addDeviceLog("WARN: Jalur Google FCM diblokir/tanpa kredensial. Mengaktifkan Token Simulator Aman...");
    const randChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
    let mockToken = "fcm_mock_tok_";
    for (let i = 0; i < 140; i++) {
      mockToken += randChars.charAt(Math.floor(Math.random() * randChars.length));
    }
    setFcmToken(mockToken);
    addDeviceLog("SUKSES: Token Simulator diaktifkan (Siap untuk Dasbor utama).");
    db.registerSimulatorToken(mockToken);
  };

  const copyTokenToClipboard = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken);
    setCopied(true);
    addDeviceLog("Token disalin ke Papan Klip!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen w-full bg-[#030712] p-4 flex flex-col items-center justify-center relative overflow-y-auto">
      
      {/* Background radial gradient */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.08),transparent_70%)]"></div>

      {/* Back Button */}
      <div className="absolute top-6 left-6 z-30">
        <Link href="/" className="text-[10px] font-mono text-cyan-400 flex items-center gap-2 hover:text-white transition-all bg-slate-950/80 py-2 px-3 rounded border border-zinc-800/40 w-fit">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>KEMBALI KE KONSOL POLRI</span>
        </Link>
      </div>

      {/* MOBILE DEVICE CONTAINER */}
      <div className="w-full max-w-[400px] h-[92vh] max-h-[880px] bg-[#090d16] rounded-[45px] border-4 border-zinc-800 p-3 shadow-2xl relative z-10 flex flex-col shadow-[0_0_40px_rgba(6,182,212,0.15)] overflow-hidden">
        
        {/* Device Speaker & Camera Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4 bg-black rounded-full border border-zinc-800/80 flex justify-center items-center gap-1.5 z-40">
          <div className="w-12 h-1 bg-zinc-800 rounded"></div>
          <div className="w-2 h-2 bg-zinc-900 rounded-full border border-zinc-800"></div>
        </div>

        {/* SCREEN CONTAINER (Inner screen) */}
        <div className="flex-1 flex flex-col relative overflow-hidden rounded-[36px] bg-[#030712] border border-zinc-900 mt-2 z-20">
          
          {/* Status Bar (Burger Menu & SYSTEM ACTIVE status) */}
          <div className="flex justify-between items-center px-4 pt-3.5 pb-2 border-b border-zinc-900 bg-slate-950/95 text-[10px] font-mono text-zinc-400 relative z-25">
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-1 -m-1"
            >
              <Menu className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-400/30 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.15)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[8px] font-bold text-emerald-400 tracking-wider">SISTEM AKTIF</span>
            </div>
          </div>

          {/* SCREEN SCROLLABLE CONTENT */}
          <div className="flex-1 flex flex-col overflow-y-auto relative p-4 z-20">
            {activeTab === "home" && (
              <div className="flex-1 flex flex-col justify-between h-full z-20">
                
                {/* Top Header Group */}
                <div className="text-center pt-2 pb-4 flex flex-col items-center gap-2.5">
                  <div>
                    <h1 className="text-3xl font-extrabold font-mono text-slate-100 uppercase leading-none">LAPANG</h1>
                    <p className="text-xs font-mono text-cyan-400 uppercase mt-1.5 leading-none">Laporan Anak Hilang</p>
                  </div>
                  
                  <div className={`text-[9px] font-mono py-1 px-3 rounded-full flex items-center gap-1.5 mx-auto border transition-all ${
                    locationState === "found" 
                      ? "text-emerald-400 bg-emerald-950/20 border-emerald-800/40 shadow-[0_0_8px_rgba(52,211,153,0.15)]" 
                      : locationState === "denied"
                      ? "text-rose-500 bg-rose-950/20 border-rose-800/40 animate-pulse"
                      : "text-zinc-500 bg-zinc-950 border-zinc-900/60"
                  }`}>
                    <MapPin className="h-3 w-3" />
                    <span>{locationText}</span>
                  </div>
                </div>

                {/* Centered Logo Container */}
                <div className="flex-1 flex items-center justify-center relative my-4">
                  <div className="relative flex items-center justify-center">
                    {/* Pulsing glow ring */}
                    <div 
                      className="absolute rounded-full bg-cyan-500/10 border border-cyan-500/30"
                      style={{
                        width: '180px',
                        height: '180px',
                        animation: 'ring-glow-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      }}
                    ></div>
                    
                    {/* Breathing main container */}
                    <div 
                      className="relative h-28 w-28 bg-slate-950 border border-zinc-800 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.1)]"
                      style={{
                        animation: 'logo-pulsate 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                      }}
                    >
                      <img src="/lapang-logomark-white.svg" className="h-16 w-16" alt="LAPANG" />
                      
                      {/* Blinking green status dot inside the logo circle */}
                      <span className="absolute bottom-2 right-2 h-2.5 w-2.5 bg-emerald-400 rounded-full border border-slate-950 shadow-[0_0_8px_#34d399]" style={{ animation: 'logo-blinking 1.2s infinite' }}></span>
                    </div>
                  </div>
                </div>

                {/* Bottom Report Card */}
                <div className="flex flex-col gap-2 pt-2 pb-2">
                  <div className="text-[10px] font-bold text-cyan-400 tracking-wider text-left pl-2 font-mono uppercase">
                    PENGADUAN DARURAT
                  </div>
                  <div className="bg-slate-950/95 border border-cyan-500/20 p-5 rounded-2xl text-center space-y-4 relative overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.05)]">
                    {/* Subtle top indicator bar */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 to-cyan-400"></div>
                    
                    <div className="flex items-center gap-4 text-left">
                      <span className="material-symbols-outlined text-[52px] leading-none text-white select-none flex-shrink-0">
                        zone_person_urgent
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-100 font-mono leading-relaxed">
                        Melihat indikasi atau percobaan penculikan anak?
                      </h3>
                    </div>

                    <button
                      onClick={() => setShowReportModal(true)}
                      className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-mono font-bold text-xs cursor-pointer tracking-wider transition-all shadow-[0_4px_20px_rgba(220,38,38,0.4)] active:scale-[0.98]"
                    >
                      LAPOR SEGERA
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "telemetry" && (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="border-b border-zinc-800 pb-2">
                  <h2 className="text-sm font-bold text-cyan-400 font-mono uppercase">Sistem Telemetri</h2>
                  <p className="text-[8px] text-zinc-500 font-mono uppercase">Status & Log Perangkat Seluler</p>
                </div>

                {/* Permission status cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950 border border-zinc-850 p-2.5 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[8px] text-zinc-400 font-bold uppercase">IZIN NOTIFIKASI</span>
                    <span className={`text-[9px] font-bold font-mono uppercase ${
                      permission === "granted" ? "text-emerald-400" : "text-rose-400"
                    }`}>{permission === "granted" ? "AKTIF" : "NON-AKTIF"}</span>
                  </div>
                  <div className="bg-slate-950 border border-zinc-850 p-2.5 rounded-lg flex flex-col gap-1.5">
                    <span className="text-[8px] text-zinc-400 font-bold uppercase">IZIN LOKASI (GPS)</span>
                    <span className="text-[9px] font-bold font-mono text-emerald-400 uppercase">AKTIF (SELALU)</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-zinc-850 p-2.5 rounded-lg flex flex-col gap-1.5">
                  <span className="text-[8px] text-zinc-400 font-bold uppercase">IZIN TAMPIL DI ATAS APLIKASI LAIN</span>
                  <span className="text-[9px] font-bold font-mono text-emerald-400 uppercase">DIIZINKAN (AKTIF)</span>
                </div>

                <button
                  onClick={handleRequestPermission}
                  disabled={isRegistering}
                  className="w-full py-2 bg-cyan-500/10 border border-cyan-400/20 hover:bg-cyan-500/20 text-cyan-400 text-[9px] font-bold font-mono rounded cursor-pointer transition-all uppercase"
                >
                  Ajukan Izin Notifikasi Mock
                </button>

                {/* Token Card */}
                {fcmToken && (
                  <div className="bg-slate-950 border border-zinc-850 p-3 rounded-lg space-y-2">
                    <div className="text-[9px] font-bold text-emerald-400 flex justify-between items-center uppercase font-mono">
                      <span>FCM Service Token</span>
                      <span className="text-[7px] border border-emerald-500/30 px-1 py-0.2 rounded bg-emerald-500/5">AKTIF</span>
                    </div>
                    <div className="bg-black/60 border border-zinc-900 p-2 rounded text-[8px] text-zinc-400 break-all leading-normal max-h-[60px] overflow-y-auto font-mono">
                      {fcmToken}
                    </div>
                    <button
                      onClick={copyTokenToClipboard}
                      className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[8px] font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1 uppercase font-mono"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copied ? "BERHASIL DISALIN!" : "SALIN TOKEN REGISTRASI"}</span>
                    </button>
                  </div>
                )}

                {/* Terminal Logger */}
                <div className="bg-slate-950 border border-zinc-850 p-3 rounded-lg flex flex-col flex-1 min-h-[140px]">
                  <div className="text-[9px] font-bold text-cyan-400 mb-2 uppercase flex items-center gap-1 font-mono">
                    <Radio className="h-3 w-3" /> Log Aktivitas Telemetri
                  </div>
                  <div className="flex-1 bg-black/60 border border-zinc-900 p-2 rounded text-[8px] text-zinc-400 overflow-y-auto space-y-1.5 font-mono min-h-[80px]">
                    {deviceLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed border-b border-zinc-900/50 pb-1 last:border-b-0">{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === "how-it-works" && (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="border-b border-zinc-800 pb-2">
                  <h2 className="text-sm font-bold text-cyan-400 font-mono uppercase">Cara Kerja Geofencing</h2>
                  <p className="text-[8px] text-zinc-500 font-mono uppercase">Sistem Filter Sinyal Client-Side</p>
                </div>

                <div className="bg-slate-950 border border-zinc-850 p-3 rounded-lg space-y-3 font-mono text-[9px] text-zinc-300 leading-relaxed max-h-[350px] overflow-y-auto">
                  <div className="p-2 bg-cyan-950/20 border border-cyan-800/20 rounded text-cyan-400 font-bold uppercase">
                    FILTRASI FORMULA HAVERSINE
                  </div>
                  <p className="text-[9px] leading-relaxed">
                    Sistem LAPANG memfilter sinyal notifikasi darurat secara client-side menggunakan Formula Haversine. Saat server memancarkan koordinat lokasi penculikan, perangkat penerima menghitung jarak antara lokasi kejadian dengan lokasi terkini perangkat.
                  </p>
                  
                  <div className="bg-black/60 p-2 border border-zinc-850 rounded text-center text-slate-350 space-y-1">
                    <div className="font-bold text-cyan-400 text-[8px]">RUMUS HAVERSINE:</div>
                    <code className="text-[8px] block py-1 break-all">
                      a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
                    </code>
                    <code className="text-[8px] block py-1 break-all">
                      c = 2 * atan2(√a, √(1-a))
                    </code>
                    <code className="text-[8px] block py-1">
                      d = R * c (R = 6371 km)
                    </code>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-300 text-[8px] uppercase">Tabel Referensi Sektor Lokasi:</div>
                    <table className="w-full text-[8px] border-collapse border border-zinc-850 text-zinc-400">
                      <thead>
                        <tr className="bg-slate-900 text-cyan-400">
                          <th className="border border-zinc-850 p-1 text-left">Sektor</th>
                          <th className="border border-zinc-850 p-1 text-center">Latitude</th>
                          <th className="border border-zinc-850 p-1 text-center">Longitude</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-zinc-850 p-1">Kertek, Jateng</td>
                          <td className="border border-zinc-850 p-1 text-center">-7.3683</td>
                          <td className="border border-zinc-850 p-1 text-center">109.9764</td>
                        </tr>
                        <tr>
                          <td className="border border-zinc-850 p-1">Menteng, Jakarta</td>
                          <td className="border border-zinc-850 p-1 text-center">-6.2088</td>
                          <td className="border border-zinc-850 p-1 text-center">106.8456</td>
                        </tr>
                        <tr>
                          <td className="border border-zinc-850 p-1">Depok, DIY</td>
                          <td className="border border-zinc-850 p-1 text-center">-7.7972</td>
                          <td className="border border-zinc-850 p-1 text-center">110.3783</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-300 text-[8px] uppercase">Diagram Alir Geofence (ASCII):</div>
                    <pre className="bg-black/60 p-2 border border-zinc-850 rounded text-[7px] text-emerald-400 leading-normal overflow-x-auto whitespace-pre">
{` [ Server: Siaran Sinyal FCM ]
             │
             ▼
 [ Device: Terima Payload GPS ]
             │
             ▼
 [ Device: Hitung Haversine ]
             │
 ┌───────────┴───────────┐
 ▼                       ▼
[ Jarak < 10 km? ]     [ Jarak >= 10 km? ]
 │                       │
 ▼                       ▼
[ SIRINE MENYALA ]     [ ABAIKAN / SENYAP ]
[ Takeover Overlay ]   [ Simpan di Log ]`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "license" && (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="border-b border-zinc-800 pb-2">
                  <h2 className="text-sm font-bold text-cyan-400 font-mono uppercase">Lisensi Kode</h2>
                  <p className="text-[8px] text-zinc-500 font-mono uppercase">Apache License 2.0</p>
                </div>

                <div className="bg-slate-950 border border-zinc-850 p-3 rounded-lg flex-1 min-h-[220px] overflow-y-auto font-mono text-[8px] text-zinc-400 leading-relaxed max-h-[350px]">
                  <p className="font-bold text-zinc-300 mb-2">Apache License, Version 2.0</p>
                  <p className="mb-2 text-zinc-500 font-bold">Copyright 2026 Rahman (project-flash0 / LAPANG)</p>
                  <p className="mb-2">Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.</p>
                  <p className="mb-2">You may obtain a copy of the License at:</p>
                  <p className="text-cyan-400 underline mb-2 break-all">http://www.apache.org/licenses/LICENSE-2.0</p>
                  <p className="mb-4">Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.</p>
                  <div className="border-t border-zinc-850 pt-2.5 mt-2 space-y-2 text-zinc-500">
                    <p className="font-bold text-zinc-400">TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION</p>
                    <p className="font-bold">1. Definitions.</p>
                    <p className="pl-2">"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.</p>
                    <p className="pl-2">"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.</p>
                    <p className="pl-2">"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity.</p>
                    <p className="font-bold">2. Grant of Copyright License.</p>
                    <p className="pl-2">Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.</p>
                    <p className="font-bold">3. Grant of Patent License.</p>
                    <p className="pl-2">Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "about" && (
              <div className="flex-1 flex flex-col space-y-4 font-mono">
                <div className="border-b border-zinc-800 pb-2">
                  <h2 className="text-sm font-bold text-cyan-400 font-mono uppercase">Tentang Proyek</h2>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Detail Submisi Resmi</p>
                </div>

                <div className="overflow-y-auto flex flex-col gap-4 flex-1 pr-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <img src="/banner.jpg" className="w-full h-auto object-cover rounded border border-zinc-800/40" alt="Google Juara Vibe Coding" />
                  
                  <div className="font-mono text-[13px] text-zinc-300 space-y-4 leading-relaxed">
                    <p>
                      <span className="text-cyan-400 font-bold">LAPANG</span> adalah solusi kemainan taktis yang dirancang untuk mempercepat koordinasi pencarian anak hilang menggunakan penyaringan geofencing berbasis koordinat GPS.
                    </p>

                    {/* Blok 1: Kreator Proyek */}
                    <div className="space-y-2 border-t border-zinc-800/60 pt-3">
                      <div className="text-cyan-400 font-bold text-xs uppercase tracking-wider">KREATOR PROYEK:</div>
                      <div className="grid grid-cols-3 gap-y-1 text-xs">
                        <span className="text-zinc-500">Nama:</span>
                        <span className="col-span-2 text-slate-200 font-bold">Rahman Hanafi</span>
                        
                        <span className="text-zinc-500">Versi:</span>
                        <span className="col-span-2 text-slate-200 font-bold">v0.3.0</span>
                        
                        <span className="text-zinc-500">Lisensi:</span>
                        <span className="col-span-2 text-slate-200">Apache License 2.0</span>
                        
                        <span className="text-zinc-500">Teknologi:</span>
                        <span className="col-span-2 text-slate-200">Flutter SDK, Next.js, Firebase FCM, Geolocator</span>
                      </div>
                      
                      <div className="flex flex-col gap-2 pt-2">
                        <a 
                          href="https://github.com/fromrha/project-flash0" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block text-center py-2 px-3 border border-cyan-800/30 hover:border-cyan-400 text-cyan-400 rounded-full font-bold text-[10px] uppercase tracking-wider transition-all"
                        >
                          Repositori GitHub
                        </a>
                        <a 
                          href="https://github.com/fromrha" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="block text-center py-2 px-3 border border-zinc-800/60 hover:border-zinc-400 text-zinc-400 rounded-full font-bold text-[10px] uppercase tracking-wider transition-all"
                        >
                          Portofolio GitHub
                        </a>
                      </div>
                    </div>

                    {/* Blok 2: Submisi Resmi Google */}
                    <div className="space-y-2 border-t border-zinc-800/60 pt-3">
                      <div className="text-cyan-400 font-bold text-xs uppercase tracking-wider">SUBMISI RESMI GOOGLE:</div>
                      <p className="text-[12px] text-zinc-400 leading-relaxed">
                        Proyek ini dikembangkan secara khusus sebagai submisi resmi untuk ajang kompetisi Google Juara Vibe Coding. Mengintegrasikan teknologi cloud, geofencing real-time, dan push notification berkecepatan tinggi.
                      </p>
                      <a
                        href="https://rsvp.withgoogle.com/events/juaravibecoding"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                      >
                        Kunjungi Google Vibe Coding
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* REPORT WEBVIEW MODAL (Inside screen context) */}
          {showReportModal && (
            <div className="absolute inset-0 bg-zinc-950 z-[35] flex flex-col animate-fade-in font-mono">
              <div className="flex items-center gap-3 p-3 border-b border-zinc-900 bg-slate-950">
                <button onClick={() => setShowReportModal(false)} className="text-zinc-400 hover:text-white cursor-pointer p-1">
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div className="text-[10px] font-bold text-slate-200">FORM PENGADUAN SAKSI</div>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-4">
                <div className="bg-rose-950/20 border border-rose-500/20 p-2.5 rounded text-[9px] text-rose-400 break-all leading-normal">
                  KASUS: {simulatedAlert?.secure_token_id || "MOCK_CASE_ID"}
                </div>
                <textarea 
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Deskripsikan petunjuk yang Anda lihat..."
                  className="w-full flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-[10px] text-slate-200 placeholder:text-zinc-500 resize-none outline-none focus:border-cyan-400"
                />
                <button
                  onClick={async () => {
                    if (reportText.trim()) {
                      const reporterLat = simulatedAlert?.incident_info?.geo_coordinates?.latitude || -7.3683;
                      const reporterLong = simulatedAlert?.incident_info?.geo_coordinates?.longitude || 109.9764;
                      
                      if (isOnline) {
                        db.stashReport(simulatedAlert?.secure_token_id || "MOCK_CASE_ID", { latitude: reporterLat, longitude: reporterLong }, reportText);
                        await db.flushOfflineQueue();
                        addDeviceLog("SUKSES: Laporan saksi mata berhasil dikirim ke server POLRI!");
                        alert("Laporan berhasil dikirim ke server POLRI!");
                      } else {
                        db.stashReport(simulatedAlert?.secure_token_id || "MOCK_CASE_ID", { latitude: reporterLat, longitude: reporterLong }, reportText);
                        addDeviceLog("OFFLINE: Laporan saksi mata diamankan di antrean SDK.");
                        alert("Koneksi buruk. Laporan Anda telah diamankan di antrean lokal SDK.");
                      }
                    }
                    setShowReportModal(false);
                    setSimulatedIncomingAlert(false);
                    setReportText("");
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs cursor-pointer tracking-wider"
                >
                  KIRIM LAPORAN ONLINE
                </button>
              </div>
            </div>
          )}

          {/* SIDE NAVIGATION DRAWER (80% Width Overlay) */}
          <div 
            className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 z-30 ${
              isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => setIsDrawerOpen(false)}
          >
            <div 
              className={`absolute top-0 left-0 h-full w-[80%] bg-[#0B0F19] border-r border-zinc-850 flex flex-col z-45 transition-transform duration-300 font-mono ${
                isDrawerOpen ? "translate-x-0" : "-translate-x-full"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-4 flex justify-between items-center bg-transparent">
                <img src="/lapang-logo-white-loc1.svg" className="h-6 object-contain opacity-85" alt="LAPANG" />
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-zinc-400 hover:text-white p-1 hover:bg-zinc-800 rounded transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Body - Tabs */}
              <div className="flex-1 p-3 space-y-1 overflow-y-auto">
                {[
                  { id: "home", label: "Beranda", icon: Home },
                  { id: "telemetry", label: "Sistem Telemetri", icon: Terminal },
                  { id: "how-it-works", label: "Cara Kerja", icon: HelpCircle },
                  { id: "license", label: "Lisensi Kode", icon: FileText },
                  { id: "about", label: "Tentang", icon: Info },
                ].map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all text-left cursor-pointer ${
                        isActive 
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                          : "text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent"
                      }`}
                    >
                      <IconComponent className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 bg-transparent space-y-1 text-[8px] text-zinc-500 font-mono">
                <div>VERSI APLIKASI:</div>
                <div className="text-zinc-350 font-bold mb-1.5">v0.3.0</div>
                <div>WAKTU SERVER:</div>
                <div className="text-zinc-350 font-bold mb-1.5">{currentTime || "00:00:00"}</div>
                <div>KOORDINAT SEKARANG:</div>
                <div className="text-zinc-350 font-bold break-all">{latLngText}</div>
              </div>
            </div>
          </div>

          {/* Bottom Screen navigation indicator bar */}
          <div className="w-full flex justify-center items-center py-2 bg-slate-950/95 border-t border-zinc-900/50 z-20">
            <div className="w-20 h-1 bg-zinc-800 rounded-full"></div>
          </div>

        </div>

      </div>

      {/* FULLSCREEN EMERGENCY ALERT TAKEOVER */}
      {simulatedAlert && simulatedIncomingAlert && (
        <div className="fixed inset-0 bg-black/98 z-50 p-6 flex flex-col justify-between items-center font-mono">
          <div className="w-full max-w-sm flex flex-col items-center text-center mt-12">
            {/* Glowing Pulse Ring */}
            <div className="h-16 w-16 bg-rose-600/20 border-2 border-rose-500 rounded-full flex items-center justify-center mb-6 animate-bounce relative">
              <ShieldAlert className="text-rose-500 h-8 w-8" />
              <span className="absolute inset-0 border-4 border-rose-500 rounded-full animate-ping opacity-75"></span>
            </div>
            
            <h2 className="text-lg font-bold text-rose-500 uppercase tracking-widest animate-pulse">SIAGA 1: PENCULIKAN ANAK</h2>
            <p className="text-[10px] text-rose-400 uppercase mt-1 tracking-wider">PERINGATAN DITERIMA: AREA RADIUS SIAGA 1</p>

            {/* Victim Details card */}
            <div className="w-full bg-zinc-950 border border-rose-500/30 p-4 rounded-xl mt-6 space-y-3 text-left">
              <div className="flex justify-between items-center border-b border-rose-500/20 pb-2">
                <span className="text-xs font-bold text-slate-100">{simulatedAlert.victim_info.name} ({simulatedAlert.victim_info.age}th)</span>
                <span className="text-[8px] border border-rose-500/40 text-rose-400 px-1.5 py-0.5 rounded uppercase font-bold">AKTIF</span>
              </div>

              <div className="text-[10px] space-y-1.5 text-zinc-300">
                <div><span className="text-rose-400 font-bold uppercase">TERAKHIR TERLIHAT:</span> {simulatedAlert.incident_info.last_seen_location}</div>
                <div><span className="text-rose-400 font-bold uppercase">PAKAIAN TERAKHIR:</span> {simulatedAlert.victim_info.last_clothing}</div>
                <div><span className="text-rose-400 font-bold uppercase">KENDARAAN PENCULIK:</span> {simulatedAlert.incident_info.suspect_description}</div>
              </div>

              <div className="bg-rose-950/20 border border-rose-500/20 p-2.5 rounded text-[9px] leading-relaxed text-rose-350 italic">
                "{simulatedAlert.ai_summary}"
              </div>
            </div>
          </div>

          {/* Thumb-Optimized Action Blocks */}
          <div className="w-full max-w-sm flex gap-4 mb-8">
            <button
              onClick={() => {
                if (!isOnline) {
                  const offlineQueue = JSON.parse(localStorage.getItem("lapang_sdk_offline_queue") || "[]");
                  offlineQueue.push({
                    internal_case_id: simulatedAlert.internal_case_id,
                    gps: "JKT-LAT:-6.2088,LON:106.8456",
                    report: "Aksi lapor petunjuk dipicu saat offline",
                    timestamp: new Date().toISOString()
                  });
                  localStorage.setItem("lapang_sdk_offline_queue", JSON.stringify(offlineQueue));
                  alert("Koneksi buruk. Laporan Anda telah diamankan di antrean lokal SDK dan akan otomatis diteruskan ke server POLRI saat sinyal pulih.");
                  setSimulatedIncomingAlert(false);
                  addDeviceLog("Koneksi buruk. Laporan masuk antrean lokal SDK.");
                } else {
                  setShowReportModal(true);
                }
              }}
              className="flex-1 py-3.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-slate-350 rounded-xl text-xs font-bold uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 animate-pulse"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>LAPOR PETUNJUK</span>
            </button>
            <button
              onClick={() => {
                const secureLink = `https://lapang.polri.go.id/report/${simulatedAlert.secure_token_id}`;
                navigator.clipboard.writeText(`DITEMUKAN ALERT LAPANG: ${simulatedAlert.ai_summary}\nLapor di: ${secureLink}`);
                setSimulatedIncomingAlert(false);
                addDeviceLog("SUKSES: Teks & link disalin ke clipboard!");
              }}
              className="flex-1 py-3.5 bg-blue-600 border border-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/30"
            >
              <Copy className="h-4 w-4" />
              <span>SIMPAN & SALIN</span>
            </button>
          </div>
        </div>
      )}

      {/* Custom Keyframe Animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes logo-pulsate {
          0%, 100% {
            transform: scale(1);
            opacity: 0.95;
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.2);
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
            box-shadow: 0 0 35px rgba(6, 182, 212, 0.45);
          }
        }
        @keyframes ring-glow-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.15;
          }
          50% {
            transform: scale(1.25);
            opacity: 0.35;
          }
        }
        @keyframes logo-blinking {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.25;
          }
        }
      ` }} />

    </main>
  );
}
