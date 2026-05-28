"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ShieldAlert, 
  Radio, 
  Activity, 
  Cpu, 
  Zap, 
  Trash2, 
  Wifi, 
  WifiOff, 
  Database, 
  MapPin, 
  Clipboard, 
  ClipboardCheck, 
  UserCheck, 
  RefreshCw, 
  Lock, 
  Unlock, 
  Layers, 
  Compass, 
  Map, 
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { db, CaseAlert, StashedReport } from "@/lib/firebase";

export default function Page() {
  // Application State
  const [alerts, setAlerts] = useState<CaseAlert[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<StashedReport[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  
  // Intake Form State
  const [victimName, setVictimName] = useState("");
  const [victimAge, setVictimAge] = useState<number>(0);
  const [victimClothing, setVictimClothing] = useState("");
  const [lastSeenLocation, setLastSeenLocation] = useState("");
  const [suspectDescription, setSuspectDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [geoLat, setGeoLat] = useState<number>(-6.2088);
  const [geoLong, setGeoLong] = useState<number>(106.8456);
  const [radius, setRadius] = useState<number>(2000); // meters

  // Custom simulator / logic states
  const [narrativeInput, setNarrativeInput] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParsedSuccess, setAiParsedSuccess] = useState(false);
  const [compiledPayload, setCompiledPayload] = useState<any>(null);
  const [isTriggerLocked, setIsTriggerLocked] = useState(true);
  const [notificationDispatched, setNotificationDispatched] = useState<CaseAlert | null>(null);
  const [activeTab, setActiveTab] = useState<"intake" | "map" | "logs">("intake");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Offline report simulation
  const [simulatorNarrative, setSimulatorNarrative] = useState("");
  const [selectedCaseToken, setSelectedCaseToken] = useState("");

  // Refs for audio simulation
  const alarmAudio = useRef<HTMLAudioElement | null>(null);

  // Initialize data on mount
  useEffect(() => {
    setIsOnline(db.isOnline());
    loadDatabaseState();
    
    // Listen for custom mock events
    const handlePurge = () => {
      loadDatabaseState();
      triggerToast("CRITICAL: Zero-cache wipe executed. Data purged from all devices.");
    };

    const handleQueueFlush = () => {
      loadDatabaseState();
      triggerToast("ONLINE: Offline report queue synchronized with database.");
    };

    window.addEventListener("lapang-purge", handlePurge);
    window.addEventListener("lapang-queue-flushed", handleQueueFlush);
    
    return () => {
      window.removeEventListener("lapang-purge", handlePurge);
      window.removeEventListener("lapang-queue-flushed", handleQueueFlush);
    };
  }, []);

  const loadDatabaseState = async () => {
    const list = await db.getAlerts();
    setAlerts(list);
    setOfflineQueue(db.getOfflineQueue());
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ----------------------------------------------------
  // AI narrative parser trigger
  // ----------------------------------------------------
  const handleAiParse = async () => {
    if (!narrativeInput.trim()) return;
    setIsAiParsing(true);
    setAiParsedSuccess(false);
    
    try {
      const res = await fetch("/api/parse-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrative: narrativeInput })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Auto populate fields
        setVictimName(data.name || "ANONIM");
        setVictimAge(data.age || 0);
        setVictimClothing(data.last_clothing || "");
        setLastSeenLocation(data.last_seen_location || "");
        setSuspectDescription(data.vehicle_description || "");
        
        setAiParsedSuccess(true);
        triggerToast("AI Parse Completed! Intake fields populated.");
      } else {
        triggerToast("Error calling Gemini parser. Using deterministic fallback.");
      }
    } catch (e) {
      triggerToast("Connection error during parsing. Fallback applied.");
    } finally {
      setIsAiParsing(false);
    }
  };

  // Compile FCM Payload on form changes
  useEffect(() => {
    const payload = {
      priority: "high",
      content_available: true,
      android: {
        priority: "high",
        ttl: "0s",
        notification: {
          click_action: "FLASHzeroSDK.LOCKSCREEN_TAKEOVER",
          sound: "tactical_alarm.mp3"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            alert: {
              title: `SIAGA 1: Penculikan Anak!`,
              body: `DINI HARI: ${victimName || "ANONIM"} (${victimAge > 0 ? `${victimAge}th` : "Umur tidak diketahui"}). Pakaian: ${victimClothing || "tidak didetailkan"}. Terakhir terlihat di ${lastSeenLocation || "Lokasi diselidiki"}.`
            },
            sound: "critical_alarm.wav",
            "volume-override": 1.0
          }
        }
      },
      data: {
        token: "lp_pending_compilation",
        victim_name: victimName || "ANONIM",
        victim_age: String(victimAge),
        victim_photo: photoUrl || "null",
        incident_location: lastSeenLocation
      }
    };
    setCompiledPayload(payload);
  }, [victimName, victimAge, victimClothing, lastSeenLocation, photoUrl]);

  // Dispatch FCM Emergency Alert
  const handleDispatch = async () => {
    if (isTriggerLocked) {
      triggerToast("ERROR: Unlock primary safety mechanism first!");
      return;
    }

    try {
      const result = await db.insertAlert({
        status: "HYBRID_ACTIVE",
        victim_info: {
          name: victimName || "ANONIM",
          age: Number(victimAge) || 0,
          last_clothing: victimClothing || "Pakaian tidak didetailkan",
          photo_url: photoUrl || null
        },
        incident_info: {
          last_seen_location: lastSeenLocation || "Mencari lokasi...",
          geo_coordinates: {
            latitude: geoLat,
            longitude: geoLong
          },
          suspect_description: suspectDescription || "Mencari petunjuk kendaraan..."
        },
        ai_summary: `SIAGA: ${victimName || "ANONIM"} (${victimAge > 0 ? `${victimAge}th` : "Anak"}), diculik dekat ${lastSeenLocation || "Lokasi diselidiki"}!`
      });

      setNotificationDispatched(result);
      loadDatabaseState();
      setIsTriggerLocked(true); // Re-lock safety switch
      triggerToast("FCM HIGHEST PRIORITY DISPATCHED SUCCESSFULLY!");
      
      // Reset form
      setVictimName("");
      setVictimAge(0);
      setVictimClothing("");
      setLastSeenLocation("");
      setSuspectDescription("");
      setPhotoUrl("");
      setNarrativeInput("");
      setAiParsedSuccess(false);
    } catch (e) {
      console.error(e);
      triggerToast("Failed to insert case alert.");
    }
  };

  // Toggle Simulated Network Link
  const handleNetworkToggle = () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    db.setOnline(newStatus);
    triggerToast(newStatus ? "NETWORK ONLINE: Synchronization activated." : "NETWORK OFFLINE: Offline storage cache monitoring enabled.");
  };

  // Mock Citizen Report Submission
  const handleMockReportSubmission = () => {
    if (!selectedCaseToken) {
      triggerToast("ERROR: Choose an active case target first!");
      return;
    }
    if (!simulatorNarrative.trim()) {
      triggerToast("ERROR: Narrate witness context!");
      return;
    }

    const reporterLat = geoLat + (Math.random() - 0.5) * 0.01;
    const reporterLong = geoLong + (Math.random() - 0.5) * 0.01;

    if (isOnline) {
      // Direct post to database via simulation helper
      db.stashReport(selectedCaseToken, { latitude: reporterLat, longitude: reporterLong }, simulatorNarrative);
      db.flushOfflineQueue();
      triggerToast("SUCCESS: Citizen report dispatched directly to police desk!");
    } else {
      // Network trap -> stash locally
      db.stashReport(selectedCaseToken, { latitude: reporterLat, longitude: reporterLong }, simulatorNarrative);
      setOfflineQueue(db.getOfflineQueue());
      triggerToast("OFFLINE: Low signal. Stashed safely in client resilient queue!");
    }

    setSimulatorNarrative("");
  };

  // Trigger absolute zero cryptographic purge
  const handlePurgeCase = async (id: string) => {
    const confirm = window.confirm("WARNING: Excuting CRYPTOGRAPHIC PURGE wipes all public references, photo CDN links, and memory traces of this child across all local and remote nodes. Proceed?");
    if (confirm) {
      await db.purgeCase(id);
    }
  };

  // Clipboard copies
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    triggerToast(`COPIED: ${label}`);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Visual Coordinates Randomizer (Triangulation simulation)
  const simulateTriangulation = () => {
    // Random offset around Jakarta center
    const newLat = -6.2088 + (Math.random() - 0.5) * 0.05;
    const newLng = 106.8456 + (Math.random() - 0.5) * 0.05;
    setGeoLat(Number(newLat.toFixed(6)));
    setGeoLong(Number(newLng.toFixed(6)));
    triggerToast("COMPUTED: Live map geo-coordinates triangulated.");
  };

  return (
    <main className="min-h-screen w-full flex flex-col relative tactical-grid-bg bg-tactical-dark p-4 md:p-6 overflow-y-auto">
      
      {/* Toast Alert overlay */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 tactical-glass-highlight p-4 rounded-lg flex items-center gap-3 animate-pulse border-cyan-beacon">
          <Activity className="text-cyan-beacon h-5 w-5" />
          <span className="text-sm font-mono text-cyan-beacon uppercase tracking-wider">{toastMessage}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      <header className="w-full flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-tactical-slate pb-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary-trust rounded-lg flex items-center justify-center border border-cyan-beacon/40 tactical-glow-blue">
            <ShieldAlert className="text-cyan-beacon h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider font-mono flex items-center gap-2 text-slate-100">
              LAPANG <span className="text-xs bg-primary-trust/60 text-cyan-beacon border border-cyan-beacon/30 px-2 py-0.5 rounded font-sans uppercase">POLRI COMMAND CONSOLE</span>
            </h1>
            <p className="text-xs text-tactical-gray font-mono">SYSTEM INTERFACE VERSION Pre-Beta v0.1.0 // SPARK DUAL CONFIGURATION</p>
          </div>
        </div>

        {/* STATUS PANEL */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded border border-tactical-slate">
            <Radio className="text-emerald-500 h-3.5 w-3.5 animate-pulse" />
            <span className="text-slate-400">FCM SERVER: <span className="text-emerald-400">ACTIVE</span></span>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded border border-tactical-slate">
            <Cpu className="text-cyan-beacon h-3.5 w-3.5" />
            <span className="text-slate-400">APNs TUNNEL: <span className="text-cyan-beacon font-bold">SECURE (1.0 VOL)</span></span>
          </div>

          {/* Network Simulator Controls */}
          <button 
            onClick={handleNetworkToggle}
            className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all cursor-pointer border ${
              isOnline 
                ? "bg-tactical-emerald/10 border-tactical-emerald text-emerald-400 hover:bg-tactical-emerald/20" 
                : "bg-tactical-rose/10 border-tactical-rose text-rose-400 hover:bg-tactical-rose/20"
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span>LINK STATUS: ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                <span>LINK STATUS: OFFLINE</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN ASYMMETRIC GRID LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start w-full">
        
        {/* COLUMN 1: POLRI EMERGENCY INTAKE & PARSER (xl:col-span-7) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          
          {/* AI Narative Parser Block */}
          <section className="tactical-glass p-5 rounded-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-beacon to-transparent opacity-60"></div>
            <div className="flex items-center justify-between mb-4 border-b border-tactical-slate pb-3">
              <h2 className="text-sm font-semibold tracking-wider font-mono text-cyan-beacon flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-beacon" /> 
                [INTAKE SECTION 01] // GEMINI AI WITNESS LOG PARSER
              </h2>
              <span className="text-[10px] text-tactical-gray font-mono">MODEL: GEMINI-1.5-FLASH</span>
            </div>
            
            <p className="text-xs text-slate-350 mb-3 leading-relaxed">
              Paste messy, unstructured witness statements, bystander narrative logs, or chat messages. 
              The AI Engine parses it instantly to auto-fill the child abduction docket.
            </p>

            <div className="flex flex-col gap-3">
              <textarea
                value={narrativeInput}
                onChange={(e) => setNarrativeInput(e.target.value)}
                placeholder="Example: Saya melihat seorang anak laki-laki bernama Alden umur kira-kira 6 tahun memakai baju kaos merah dan celana jeans biru diculik di dekat halte busway Bundaran HI. Penculiknya memakai mobil Avanza Hitam dengan plat B 1234 GZ..."
                className="w-full h-24 bg-tactical-black border border-tactical-slate rounded p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono leading-relaxed"
              />
              
              <button
                onClick={handleAiParse}
                disabled={isAiParsing || !narrativeInput.trim()}
                className={`py-2 px-4 rounded text-xs font-mono font-bold tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  narrativeInput.trim() 
                    ? "bg-electric-alert text-white hover:bg-electric-alert/80 hover:shadow-lg hover:shadow-electric-alert/20" 
                    : "bg-tactical-slate text-slate-500 cursor-not-allowed"
                }`}
              >
                {isAiParsing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>PARSING VIA GOOGLE AI API LAYER...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>RUN GEMINI NARRATIVE COMPLIANCE EXTRACTOR</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Primary Abduction Intake Form */}
          <section className="tactical-glass p-5 rounded-lg relative">
            <div className="flex items-center justify-between mb-4 border-b border-tactical-slate pb-3">
              <h2 className="text-sm font-semibold tracking-wider font-mono text-cyan-beacon flex items-center gap-2">
                <Database className="h-4 w-4" />
                [INTAKE SECTION 02] // CHILD ABDUCTION CASE INTAKE DOCKET
              </h2>
              <span className="text-[10px] text-rose-500 font-mono flex items-center gap-1 animate-pulse">
                <AlertTriangle className="h-3 w-3" /> SIAGA 1 ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Field: Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">VICTIM NAME (NAMA LENGKAP / ANONIM)</label>
                <input
                  type="text"
                  value={victimName}
                  onChange={(e) => setVictimName(e.target.value)}
                  placeholder="ANONIM"
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                />
              </div>

              {/* Field: Age */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">ESTIMATED AGE (ESTIMASI USIA - TAHUN)</label>
                <input
                  type="number"
                  value={victimAge || ""}
                  onChange={(e) => setVictimAge(Number(e.target.value))}
                  placeholder="Estimated Age"
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                />
              </div>

              {/* Field: Clothing */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">LAST KNOWN CLOTHING (PAKAIAN TERAKHIR KORBAN)</label>
                <input
                  type="text"
                  value={victimClothing}
                  onChange={(e) => setVictimClothing(e.target.value)}
                  placeholder="e.g. Kaos merah marun tulisan NIKE, celana jins biru sobek lutut"
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                />
              </div>

              {/* Field: Landmark location */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">LAST SEEN LOCATION LANDMARK (HALTE / JALAN / GEDUNG)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={lastSeenLocation}
                    onChange={(e) => setLastSeenLocation(e.target.value)}
                    placeholder="e.g. Dekat halte busway Bundaran HI arah utara"
                    className="w-full bg-tactical-black border border-tactical-slate rounded pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                  />
                  <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-tactical-gray" />
                </div>
              </div>

              {/* Field: Suspect Details */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">SUSPECT VEHICLE & ABUDCTOR DESCRIPTION (DESKRIPSI KENDARAAN & PELAKU)</label>
                <input
                  type="text"
                  value={suspectDescription}
                  onChange={(e) => setSuspectDescription(e.target.value)}
                  placeholder="e.g. Toyota Avanza Hitam B 1234 GZ, penyok samping kanan belakang"
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                />
              </div>

              {/* Field: Optional Photo URL */}
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-[10px] font-mono tracking-wider text-slate-400">VICTIM PHOTO ASSETS REFERENCE URL (OPSIONAL)</label>
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="e.g. https://images.unsplash.com/photo-... (atau kosongkan untuk fallack teks)"
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-beacon/50 transition-all font-mono"
                />
              </div>
            </div>

            {/* Sub-block: Geographical Triangulation Simulation */}
            <div className="mt-5 border-t border-tactical-slate pt-5">
              <h3 className="text-xs font-mono text-cyan-beacon mb-3 flex items-center gap-2">
                <Compass className="h-4 w-4" /> [VECTOR MAP INTEGRATION] // LIVE TRIANGULATION
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-slate-400">ANCHOR LATITUDE</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geoLat}
                    onChange={(e) => setGeoLat(Number(e.target.value))}
                    className="bg-tactical-black border border-tactical-slate rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono text-slate-400">ANCHOR LONGITUDE</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={geoLong}
                    onChange={(e) => setGeoLong(Number(e.target.value))}
                    className="bg-tactical-black border border-tactical-slate rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={simulateTriangulation}
                  className="bg-primary-trust/30 border border-cyan-beacon/40 text-cyan-beacon hover:bg-primary-trust/50 hover:text-white px-3 py-2 text-xs font-mono rounded cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <Compass className="h-4 w-4 animate-spin-slow" />
                  <span>TRIANGULATE COORDINATES</span>
                </button>
              </div>

              {/* Geo Vector Visualization Canvas Mock */}
              <div className="mt-4 h-32 bg-slate-950 border border-tactical-slate rounded relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 opacity-15 bg-radial-gradient from-cyan-beacon via-transparent to-transparent"></div>
                <div className="absolute h-[1px] w-full bg-cyan-beacon/10 top-1/2"></div>
                <div className="absolute h-full w-[1px] bg-cyan-beacon/10 left-1/2"></div>
                
                {/* Geofence Radar Pulsing Ring */}
                <div className="absolute h-20 w-20 border border-cyan-beacon/30 rounded-full animate-ping opacity-60"></div>
                <div className="absolute h-10 w-10 border border-cyan-beacon/60 rounded-full animate-pulse"></div>
                <div className="absolute h-2 w-2 bg-rose-500 rounded-full shadow-lg shadow-rose-500/80"></div>
                
                <div className="absolute bottom-3 left-3 flex flex-col font-mono text-[9px] text-tactical-gray">
                  <span>SWEEP MATRIX TARGET: JKT_METRO_T1</span>
                  <span>CENTER LAT: {geoLat.toFixed(5)}, LONG: {geoLong.toFixed(5)}</span>
                </div>
                
                <div className="absolute top-3 right-3 text-cyan-beacon font-mono text-[9px] border border-cyan-beacon/35 px-2 py-0.5 rounded uppercase">
                  Radar Active (2000m)
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* COLUMN 2: FCM DISPATCH CONTROLLER & ACTIVE STATUS OVERVIEW (xl:col-span-5) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          
          {/* FCM High-Priority Dispatch Controller */}
          <section className="tactical-glass p-5 rounded-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 h-[2px] w-full bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-60"></div>
            <div className="flex items-center justify-between mb-4 border-b border-tactical-slate pb-3">
              <h2 className="text-sm font-semibold tracking-wider font-mono text-cyan-beacon flex items-center gap-2">
                <Zap className="h-4 w-4 text-rose-500 animate-pulse" />
                [DISPATCH HUB] // FCM EMERGENCY BROADCAST PARAMETERS
              </h2>
            </div>

            {/* Broadcast Area Geofence Settings */}
            <div className="flex flex-col gap-3 mb-5">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">BROADCAST GEORADIUS VECTOR:</span>
                <span className="text-cyan-beacon font-bold">{(radius / 1000).toFixed(1)} KM RADIUS</span>
              </div>
              <div className="flex gap-2">
                {[500, 1000, 2000, 5000].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadius(r)}
                    className={`flex-1 py-1 text-xs font-mono rounded border transition-all cursor-pointer ${
                      radius === r
                        ? "bg-primary-trust text-cyan-beacon border-cyan-beacon"
                        : "bg-tactical-black text-slate-500 border-tactical-slate hover:border-slate-700"
                    }`}
                  >
                    {r >= 1000 ? `${r / 1000}KM` : `${r}M`}
                  </button>
                ))}
              </div>
            </div>

            {/* Realtime Compiled Payload Preview */}
            <div className="flex flex-col gap-1.5 mb-5">
              <span className="text-[10px] font-mono tracking-wider text-slate-400">REAL-TIME COMPILED JSON DISPATCH PAYLOAD:</span>
              <pre className="bg-tactical-black text-[9px] font-mono text-emerald-400 p-3 rounded border border-tactical-slate h-36 overflow-y-auto leading-relaxed scrollbar-thin">
                {JSON.stringify(compiledPayload, null, 2)}
              </pre>
            </div>

            {/* Safety Lock & High Decibel Override Alert Trigger */}
            <div className="flex flex-col gap-3 bg-tactical-black/80 border border-rose-500/30 p-4 rounded">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-rose-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 animate-bounce" /> PRIMARY SAFETY SWITCH
                </span>
                <span className={isTriggerLocked ? "text-rose-500 font-bold" : "text-emerald-400 font-bold animate-pulse"}>
                  {isTriggerLocked ? "LOCKED" : "READY FOR LAUNCH"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsTriggerLocked(!isTriggerLocked)}
                  className={`px-3 py-2 rounded text-xs font-mono border cursor-pointer transition-all flex items-center gap-2 ${
                    isTriggerLocked
                      ? "bg-rose-500/10 border-rose-500 text-rose-400 hover:bg-rose-500/20"
                      : "bg-tactical-emerald/10 border-tactical-emerald text-emerald-400 hover:bg-tactical-emerald/20"
                  }`}
                >
                  {isTriggerLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4 text-emerald-400" />}
                  <span>{isTriggerLocked ? "UNLOCK LAUNCH" : "LOCK SAFETY"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDispatch}
                  disabled={isTriggerLocked}
                  className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-widest rounded border transition-all ${
                    isTriggerLocked
                      ? "bg-tactical-slate text-slate-600 border-tactical-slate cursor-not-allowed"
                      : "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white border-rose-500 hover:shadow-lg hover:shadow-rose-500/20 cursor-pointer animate-pulse"
                  }`}
                >
                  DISPATCH EMERGENCY CRITICAL FCM BROADCAST
                </button>
              </div>
            </div>
          </section>

          {/* Active Incidents Monitor & Cryptographic Purge System */}
          <section className="tactical-glass p-5 rounded-lg">
            <div className="flex items-center justify-between mb-4 border-b border-tactical-slate pb-3">
              <h2 className="text-sm font-semibold tracking-wider font-mono text-cyan-beacon flex items-center gap-2">
                <Activity className="h-4 w-4" />
                [CASE MONITOR] // LIVE ABDUCTION SYSTEM REGISTRY
              </h2>
              <span className="text-[10px] bg-tactical-slate px-2 py-0.5 rounded font-mono text-slate-350">{alerts.length} CASES</span>
            </div>

            {alerts.length === 0 ? (
              <div className="h-32 bg-tactical-black/40 border border-dashed border-tactical-slate rounded flex flex-col items-center justify-center text-slate-600 gap-2">
                <Clock className="h-6 w-6 text-slate-700" />
                <span className="text-xs font-mono tracking-wider">No active cases registered. System secure.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-1">
                {alerts.map((alert) => (
                  <div 
                    key={alert.internal_case_id} 
                    className={`border rounded p-3 bg-slate-950/60 transition-all ${
                      alert.status === "HYBRID_ACTIVE"
                        ? "border-rose-500/40"
                        : "border-tactical-slate opacity-60"
                    }`}
                  >
                    {/* Header line of alert card */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold font-mono text-slate-100 flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${alert.status === "HYBRID_ACTIVE" ? "bg-rose-500 animate-ping" : "bg-emerald-500"}`}></span>
                          {alert.victim_info.name} ({alert.victim_info.age}th)
                        </span>
                        <span className="text-[9px] font-mono text-tactical-gray mt-0.5">CASE ID: {alert.internal_case_id}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-mono ${
                          alert.status === "HYBRID_ACTIVE"
                            ? "bg-rose-950/30 text-rose-400 border-rose-500/30"
                            : "bg-emerald-950/30 text-emerald-400 border-emerald-500/30"
                        }`}>
                          {alert.status}
                        </span>

                        {alert.status === "HYBRID_ACTIVE" && (
                          <button
                            onClick={() => handlePurgeCase(alert.internal_case_id)}
                            title="Execute Cryptographic Zero-Wipe Purge"
                            className="p-1 rounded bg-rose-500/10 border border-rose-500/40 hover:bg-rose-500/20 text-rose-400 cursor-pointer transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Details content of card */}
                    <div className="text-xs font-mono space-y-1 text-slate-350 border-t border-tactical-slate/40 pt-2 mt-2">
                      <div><span className="text-tactical-gray font-bold">TERAKHIR TERLIHAT:</span> {alert.incident_info.last_seen_location}</div>
                      <div><span className="text-tactical-gray font-bold">PAKAIAN:</span> {alert.victim_info.last_clothing}</div>
                      {alert.incident_info.suspect_description && (
                        <div className="whitespace-pre-wrap"><span className="text-tactical-gray font-bold">KENDARAAN / INFORMASI:</span> {alert.incident_info.suspect_description}</div>
                      )}
                      
                      {/* Secure Token Link */}
                      <div className="mt-3 bg-tactical-black border border-tactical-slate p-2 rounded flex items-center justify-between gap-2">
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-[9px] text-tactical-gray uppercase">AEAD Secure Token URL (Public)</span>
                          <span className="text-[10px] text-cyan-beacon truncate font-mono">
                            https://lapang.polri.go.id/report/{alert.secure_token_id}
                          </span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(`https://lapang.polri.go.id/report/${alert.secure_token_id}`, "Secure case link copied!")}
                          className="p-1.5 bg-tactical-slate/50 hover:bg-tactical-slate text-slate-400 hover:text-white rounded cursor-pointer transition-all"
                          title="Copy secure link"
                        >
                          {copiedToken === `https://lapang.polri.go.id/report/${alert.secure_token_id}` ? (
                            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Clipboard className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Interactive Bystander SDK Emulation / Network Queue Test */}
          <section className="tactical-glass p-5 rounded-lg border-cyan-beacon/20">
            <div className="flex items-center justify-between mb-4 border-b border-tactical-slate pb-3">
              <h2 className="text-sm font-semibold tracking-wider font-mono text-cyan-beacon flex items-center gap-2">
                <Compass className="h-4 w-4" />
                [EMULATOR SDK CO-INTEGRATION] // CITIZEN DISPATCH SIMULATOR
              </h2>
            </div>
            
            <p className="text-xs text-slate-350 mb-3 leading-relaxed">
              Use this form to mock the native **Citizen Mobile SDK Viewport** running inside municipal applications (like JAKI). 
              If the device Owner hits "Lapor" in low-signal corridors, the system caches reports locally and automatically synchronizes when cellular links recover.
            </p>

            <div className="space-y-4 font-mono text-xs">
              
              {/* Select Case Target */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400">SELECT INTENDED ACTIVE CASE TARGET:</label>
                <select
                  value={selectedCaseToken}
                  onChange={(e) => setSelectedCaseToken(e.target.value)}
                  className="bg-tactical-black border border-tactical-slate rounded px-3 py-2 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">-- Select Active Case --</option>
                  {alerts
                    .filter((a) => a.status === "HYBRID_ACTIVE")
                    .map((a) => (
                      <option key={a.secure_token_id} value={a.secure_token_id}>
                        {a.victim_info.name} ({a.secure_token_id})
                      </option>
                    ))}
                </select>
              </div>

              {/* Witness report text */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400">ENTER WITNESS UPDATE REPORT Narrative:</label>
                <textarea
                  value={simulatorNarrative}
                  onChange={(e) => setSimulatorNarrative(e.target.value)}
                  placeholder="e.g. Melihat mobil Avanza tersebut berbelok ke arah Menteng di Jalan Imam Bonjol..."
                  className="bg-tactical-black border border-tactical-slate rounded p-2.5 h-16 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              {/* Action dispatch button */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleMockReportSubmission}
                  className="flex-1 bg-cyan-beacon/20 hover:bg-cyan-beacon/30 text-cyan-beacon border border-cyan-beacon/40 py-2 rounded font-bold cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <Compass className="h-4 w-4" />
                  <span>SUBMIT CITIZEN WITNESS REPORT</span>
                </button>
              </div>

              {/* Local Offline Queue display */}
              <div className="mt-4 border-t border-tactical-slate/40 pt-4">
                <div className="flex justify-between items-center text-[10px] text-slate-400 mb-2">
                  <span className="flex items-center gap-1 uppercase">
                    <Database className="h-3.5 w-3.5 text-rose-400" /> Offline Resilient Stashed Reports Queue
                  </span>
                  <span className="font-bold text-rose-400">{offlineQueue.length} STASHED</span>
                </div>

                {offlineQueue.length === 0 ? (
                  <div className="text-[9px] text-tactical-gray bg-tactical-black/40 border border-tactical-slate/30 p-2 rounded text-center">
                    Offline queue clean. All reports successfully dispatched.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {offlineQueue.map((rep) => (
                      <div key={rep.id} className="bg-tactical-black border border-rose-500/20 p-2 rounded text-[10px] flex justify-between items-start gap-3">
                        <div className="flex flex-col">
                          <span className="font-bold text-rose-400">CASE TOKEN: {rep.case_token}</span>
                          <span className="text-slate-350 mt-1">"{rep.narrative}"</span>
                          <span className="text-tactical-gray text-[8px] mt-1">{rep.timestamp}</span>
                        </div>
                        <span className="text-[8px] border border-rose-500/40 text-rose-400 px-1.5 rounded uppercase">Stashed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </section>

        </div>

      </div>

      {/* FOOTER METRICS LOG PANEL */}
      <footer className="mt-8 border-t border-tactical-slate pt-5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-tactical-gray">
        <div>
          <span>LAPANG EMERGENCY CONTROL DESK // METROPOLITAN SECURITY DIVISION INTAKE</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-cyan-beacon animate-pulse" /> ENGINE STATS: STABLE</span>
          <span>SYSTEM TIME: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>

    </main>
  );
}
