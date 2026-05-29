"use client";

import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
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
  ArrowLeft
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
    <main className="min-h-screen w-full bg-tactical-dark p-4 flex flex-col items-center justify-center tactical-grid-bg relative overflow-y-auto">
      
      {/* Background radial gradient */}
      <div className="absolute inset-0 pointer-events-none bg-radial-gradient from-primary-trust/10 via-transparent to-transparent"></div>

      {/* Back Button */}
      <div className="w-full max-w-md mb-4 self-center z-10">
        <Link href="/" className="text-xs font-mono text-cyan-beacon flex items-center gap-2 hover:text-white transition-all bg-slate-950/60 py-2 px-3 rounded border border-tactical-slate w-fit">
          <ArrowLeft className="h-4.5 w-4.5" />
          <span>KEMBALI KE KONSOL POLRI</span>
        </Link>
      </div>

      {/* MOBILE DEVICE CONTAINER */}
      <div className="w-full max-w-md bg-tactical-black rounded-[40px] border-4 border-tactical-slate p-4 shadow-2xl relative z-10 flex flex-col min-h-[640px] tactical-glow-blue">
        
        {/* Device Speaker & Camera Notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-4 bg-tactical-black rounded-full border border-tactical-slate/60 flex justify-center items-center gap-1.5">
          <div className="w-12 h-1 bg-zinc-800 rounded"></div>
          <div className="w-2 h-2 bg-zinc-900 rounded-full border border-zinc-850"></div>
        </div>

        {/* Mobile Screen Header */}
        <div className="flex justify-between items-center text-[10px] font-mono text-tactical-gray mt-2 px-3 border-b border-tactical-slate/30 pb-2">
          <span>LAPANG MOBILE MOCK</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setIsOnline(!isOnline);
                addDeviceLog(`Status Jaringan diubah ke: ${!isOnline ? 'ONLINE' : 'OFFLINE'}`);
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer ${isOnline ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}
            >
              {isOnline ? <Wifi className="h-3 w-3 text-emerald-400" /> : <Wifi className="h-3 w-3 text-rose-400 opacity-50" />}
              <span className={`text-[8px] font-bold ${isOnline ? "text-emerald-400" : "text-rose-400"}`}>{isOnline ? 'ON' : 'OFF'}</span>
            </button>
            <Smartphone className="h-3 w-3 text-cyan-beacon" />
            <span>12:00</span>
          </div>
        </div>

        {/* SCREEN SCROLLABLE CONTENT */}
        <div className="flex-1 flex flex-col p-3 overflow-y-auto space-y-4">
          
          {/* Header Title */}
          <div className="text-center py-2 flex flex-col items-center">
            <div className="h-10 w-10 bg-primary-trust/20 border border-cyan-beacon/30 rounded-full flex items-center justify-center mb-2">
              <Smartphone className="text-cyan-beacon h-5 w-5 animate-pulse" />
            </div>
            <h1 className="text-sm font-bold font-mono tracking-wider text-slate-100 uppercase">SIMULATOR PERANGKAT WARGA</h1>
            <p className="text-[9px] text-tactical-gray font-mono mt-1">APLIKASI PEMANTAUAN DOKET DARURAT BENCANA // FLASHzero SDK</p>
          </div>

          {/* SECTION 1: PERMISSION & REGISTRATION TRIGGER */}
          <section className="tactical-glass p-4 rounded-xl border-cyan-beacon/20 flex flex-col gap-3">
            <div className="flex justify-between items-center text-[10px] font-mono border-b border-tactical-slate/30 pb-2">
              <span className="text-cyan-beacon font-bold flex items-center gap-1">
                <Bell className="h-3.5 w-3.5" /> STATUS IZIN OS
              </span>
              <span className={`px-2 py-0.5 rounded text-[8px] uppercase border ${
                permission === "granted" 
                  ? "bg-tactical-emerald/10 border-tactical-emerald text-emerald-400"
                  : permission === "denied"
                  ? "bg-tactical-rose/10 border-tactical-rose text-rose-400"
                  : "bg-zinc-950 text-zinc-400 border-zinc-800"
              }`}>
                {permission}
              </span>
            </div>

            <p className="text-[10px] text-slate-350 leading-relaxed font-mono">
              Untuk mensimulasikan lockscreen take-over berkecepatan tinggi, perangkat membutuhkan izin notifikasi sistem penuh.
            </p>

            <button
              onClick={handleRequestPermission}
              disabled={isRegistering}
              className={`w-full py-2.5 rounded font-mono text-xs font-bold uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-2 ${
                permission === "granted"
                  ? "bg-primary-trust/10 border-cyan-beacon/50 text-cyan-beacon hover:bg-primary-trust/20"
                  : "bg-electric-alert text-white border-electric-alert hover:bg-electric-alert/80 hover:shadow-lg hover:shadow-electric-alert/20"
              }`}
            >
              {isRegistering ? (
                <>
                  <RotateCw className="h-4.5 w-4.5 animate-spin" />
                  <span>MENGHUBUNGKAN...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4.5 w-4.5" />
                  <span>AKTIFKAN SIMULATOR OS PERANGKAT</span>
                </>
              )}
            </button>
          </section>

          {/* SECTION 2: DEVICE REGISTERED TOKEN DISPLAY */}
          {fcmToken && (
            <section className="tactical-glass p-4 rounded-xl relative border-emerald-500/20">
              <div className="absolute top-0 right-0 h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-40"></div>
              <div className="flex justify-between items-center text-[10px] font-mono border-b border-tactical-slate/30 pb-2 mb-2.5">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Cpu className="h-3.5 w-3.5" /> TOKEN REGISTRASI ALAT (FCM)
                </span>
                <span className="text-[8px] text-emerald-400 uppercase">Terdaftar</span>
              </div>

              <div className="bg-tactical-black border border-tactical-slate p-2.5 rounded text-[9px] font-mono text-slate-300 break-all leading-normal">
                {fcmToken}
              </div>

              <button
                onClick={copyTokenToClipboard}
                className="w-full mt-2.5 py-1.5 rounded bg-tactical-slate/30 border border-tactical-slate hover:bg-tactical-slate/60 hover:text-white text-slate-300 text-[10px] font-mono font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">TOKEN BERHASIL DISALIN!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>SALIN TOKEN REGISTRASI</span>
                  </>
                )}
              </button>
            </section>
          )}

          {/* SECTION 3: SIMULATED INCOMING SCREEN OVERLAY INTENT */}
          {simulatedAlert && simulatedIncomingAlert && (
            <div className="fixed inset-x-0 bottom-0 top-0 bg-black/95 z-50 p-6 flex flex-col justify-between items-center animate-fade-in font-mono">
              <div className="w-full max-w-sm flex flex-col items-center text-center mt-8">
                {/* Glowing Pulse Ring */}
                <div className="h-16 w-16 bg-rose-600/20 border-2 border-rose-500 rounded-full flex items-center justify-center mb-4 animate-bounce relative">
                  <ShieldAlert className="text-rose-500 h-8 w-8" />
                  <span className="absolute inset-0 border-4 border-rose-500 rounded-full animate-ping opacity-75"></span>
                </div>
                
                <h2 className="text-lg font-bold text-rose-500 uppercase tracking-widest animate-pulse">SIAGA 1: PENCULIKAN ANAK</h2>
                <p className="text-[10px] text-rose-400 uppercase mt-1 tracking-wider">DARURAT PUSH-ALERT INTENT DILEPAS</p>

                {/* Victim Details card */}
                <div className="w-full bg-zinc-950 border border-rose-500/30 p-4 rounded-xl mt-6 space-y-3 text-left">
                  <div className="flex justify-between items-center border-b border-rose-500/20 pb-2">
                    <span className="text-xs font-bold text-slate-100">{simulatedAlert.victim_info.name} ({simulatedAlert.victim_info.age}th)</span>
                    <span className="text-[8px] border border-rose-500/40 text-rose-400 px-1.5 py-0.5 rounded uppercase font-bold">AKTIF</span>
                  </div>

                  <div className="text-[10px] space-y-1.5 text-slate-300">
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
                  className="flex-1 py-3.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-slate-300 rounded-xl text-xs font-bold uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5"
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
                  className="flex-1 py-3.5 bg-electric-alert border border-electric-alert hover:bg-electric-alert/80 text-white rounded-xl text-xs font-bold uppercase cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-electric-alert/30"
                >
                  <Copy className="h-4 w-4" />
                  <span>SIMPAN & SALIN</span>
                </button>
              </div>
            </div>
          )}

          {/* REPORT WEBVIEW MODAL */}
          {showReportModal && (
            <div className="absolute inset-0 bg-zinc-950 z-[60] flex flex-col animate-fade-in font-mono">
              <div className="flex items-center gap-3 p-3 border-b border-tactical-slate/30 bg-tactical-black">
                <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="text-xs font-bold text-slate-200">FORM PENGADUAN SAKSI</div>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-4">
                <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded text-[10px] text-rose-400 break-all">
                  KASUS: {simulatedAlert?.secure_token_id}
                </div>
                <textarea 
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Deskripsikan petunjuk yang Anda lihat..."
                  className="w-full flex-1 bg-zinc-900 border border-zinc-700 rounded p-3 text-xs text-slate-200 placeholder:text-zinc-500 resize-none outline-none focus:border-cyan-beacon"
                />
                <button
                  onClick={async () => {
                    if (simulatedAlert && reportText.trim()) {
                      const reporterLat = simulatedAlert.incident_info.geo_coordinates.latitude + (Math.random() - 0.5) * 0.01;
                      const reporterLong = simulatedAlert.incident_info.geo_coordinates.longitude + (Math.random() - 0.5) * 0.01;
                      
                      if (isOnline) {
                        db.stashReport(simulatedAlert.secure_token_id, { latitude: reporterLat, longitude: reporterLong }, reportText);
                        await db.flushOfflineQueue();
                        addDeviceLog("SUKSES: Laporan saksi mata berhasil dikirim ke server POLRI!");
                        alert("Laporan berhasil dikirim ke server POLRI!");
                      } else {
                        db.stashReport(simulatedAlert.secure_token_id, { latitude: reporterLat, longitude: reporterLong }, reportText);
                        addDeviceLog("OFFLINE: Laporan saksi mata diamankan di antrean SDK.");
                        alert("Koneksi buruk. Laporan Anda telah diamankan di antrean lokal SDK.");
                      }
                    }
                    setShowReportModal(false);
                    setSimulatedIncomingAlert(false);
                    setReportText("");
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs cursor-pointer"
                >
                  KIRIM LAPORAN ONLINE
                </button>
              </div>
            </div>
          )}

          {/* SECTION 4: REAL-TIME DEVICE CONSOLE LOGS */}
          <section className="tactical-glass p-4 rounded-xl flex-1 flex flex-col">
            <span className="text-[10px] font-mono text-tactical-gray border-b border-tactical-slate/30 pb-2 mb-2 flex items-center gap-1 uppercase">
              <Radio className="h-3.5 w-3.5 text-cyan-beacon" /> Logger Telemetri OS Perangkat
            </span>
            <div className="flex-1 bg-tactical-black/60 border border-tactical-slate p-2 rounded text-[8px] font-mono text-slate-400 overflow-y-auto space-y-1 h-36">
              {deviceLogs.map((log, idx) => (
                <div key={idx} className="truncate">{log}</div>
              ))}
            </div>
          </section>

        </div>

        {/* Mobile Screen Navigation bar indicator */}
        <div className="w-full flex justify-center items-center py-2 border-t border-tactical-slate/20">
          <div className="w-24 h-1 bg-zinc-700 rounded-full"></div>
        </div>

      </div>

    </main>
  );
}
