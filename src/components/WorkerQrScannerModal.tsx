import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, AlertCircle, CheckCircle2, Sparkles, RefreshCw, Zap, Search, User } from 'lucide-react';
import jsQR from 'jsqr';
import { Person } from '../types';

interface WorkerQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  onWorkerFound: (person: Person, scannedCode: string) => void;
}

export default function WorkerQrScannerModal({
  isOpen,
  onClose,
  people,
  onWorkerFound
}: WorkerQrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'idle' | 'requesting' | 'active' | 'error' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [matchedWorker, setMatchedWorker] = useState<Person | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [testSearch, setTestSearch] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Audio beep playback on successful QR read
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz pitch
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {
      // Audio fallback
    }
  };

  // Enumerate video input devices
  const loadDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          // Prefer back/environment camera
          const backCam = videoInputs.find(d => (d.label || "").toLowerCase().includes('back') || (d.label || "").toLowerCase().includes('environment'));
          setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
        }
      }
    } catch (e) {
      console.warn('Could not enumerate video devices:', e);
    }
  };

  // Start Camera Stream
  const startCamera = async () => {
    setCameraState('requesting');
    setErrorMessage(null);
    setScannedResult(null);
    setMatchedWorker(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser interface.');
      }

      await loadDevices();

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true'); // Required for iOS
        await videoRef.current.play();
        setCameraState('active');
        requestAnimationFrame(tickScan);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('denied');
        setErrorMessage('Camera access was denied by browser permissions. You can use manual code input or sample badge simulation below.');
      } else {
        setCameraState('error');
        setErrorMessage(err.message || 'Unable to connect to camera device.');
      }
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraState('idle');
    setTorchOn(false);
  };

  // Toggle Torch/Flashlight if available
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Torch constraint not supported on this track:', err);
      }
    }
  };

  // Continuous frame analysis loop
  const tickScan = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          const rawText = code.data.trim();
          handleCodeDetected(rawText);
          return; // Pause loop on match
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(tickScan);
  };

  // Lookup worker from QR text
  const lookupWorker = (codeText: string): Person | null => {
    const cleanText = codeText.trim().toUpperCase();

    // 1. Check for GAO-RFID-WORKER format: "GAO-RFID-WORKER:TAG-7091:John Doe"
    if (cleanText.includes('GAO-RFID-WORKER')) {
      const parts = cleanText.split(':');
      if (parts.length >= 2) {
        const extractedTag = parts[1].toUpperCase();
        const found = people.find(p => (p.hardhatTagId || p.id).toUpperCase() === extractedTag);
        if (found) return found;
      }
    }

    // 2. Direct Tag ID / Worker ID match
    let matched = people.find(p => 
      (p.hardhatTagId && (p.hardhatTagId || "").toUpperCase() === cleanText) ||
      (p.id && (p.id || "").toUpperCase() === cleanText)
    );
    if (matched) return matched;

    // 3. Substring match for Tag ID (e.g. user typed or QR has "7091")
    matched = people.find(p => 
      (p.hardhatTagId && (p.hardhatTagId || "").toUpperCase().includes(cleanText)) ||
      (cleanText.includes(p.hardhatTagId ? (p.hardhatTagId || "").toUpperCase() : '___'))
    );
    if (matched) return matched;

    // 4. Name match
    matched = people.find(p => (p.name || "").toUpperCase().includes(cleanText));
    return matched || null;
  };

  // Process detected QR code
  const handleCodeDetected = (codeText: string) => {
    playBeep();
    setScannedResult(codeText);

    const person = lookupWorker(codeText);
    if (person) {
      setMatchedWorker(person);
      setTimeout(() => {
        stopCamera();
        onWorkerFound(person, codeText);
      }, 700);
    } else {
      setMatchedWorker(null);
    }
  };

  // Lifecycle when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, selectedDeviceId]);

  if (!isOpen) return null;

  // Filter people for simulator list
  const simulatorPeople = people.filter(p => 
    !testSearch || 
    (p.name || "").toLowerCase().includes((testSearch || "").toLowerCase()) || 
    (p.hardhatTagId && (p.hardhatTagId || "").toLowerCase().includes((testSearch || "").toLowerCase()))
  ).slice(0, 8);

  return (
    <div className="fixed inset-0 z-[999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-4 px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#007BC4]/20 text-[#007BC4] rounded-xl border border-[#007BC4]/30">
              <Camera size={18} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide">Personnel QR Code Camera Scanner</h3>
              <p className="text-[11px] text-slate-400">Scan worker hardhat pass or RFID badge to fetch profile</p>
            </div>
          </div>
          <button 
            onClick={() => { stopCamera(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera Viewport Area */}
        <div className="relative bg-slate-950 aspect-video sm:aspect-[4/3] flex items-center justify-center overflow-hidden border-b border-slate-800">
          
          {/* Hidden Canvas for decoding */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Video Stream Element */}
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${cameraState === 'active' ? 'block' : 'hidden'}`}
          />

          {/* Scanner Overlay Box when active */}
          {cameraState === 'active' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 border-2 border-[#007BC4]/80 rounded-3xl shadow-[0_0_40px_rgba(0,123,196,0.4)] flex items-center justify-center overflow-hidden bg-[#007BC4]/5">
                {/* Corner Targets */}
                <div className="absolute top-2 left-2 w-6 h-6 border-t-4 border-l-4 border-[#007BC4] rounded-tl" />
                <div className="absolute top-2 right-2 w-6 h-6 border-t-4 border-r-4 border-[#007BC4] rounded-tr" />
                <div className="absolute bottom-2 left-2 w-6 h-6 border-b-4 border-l-4 border-[#007BC4] rounded-bl" />
                <div className="absolute bottom-2 right-2 w-6 h-6 border-b-4 border-r-4 border-[#007BC4] rounded-br" />

                {/* Animated Scanning Laser */}
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#00f0ff] animate-[bounce_2s_infinite]" />
              </div>

              <div className="mt-4 px-3 py-1 bg-slate-900/90 backdrop-blur-sm text-cyan-300 text-[11px] font-mono font-bold rounded-full border border-cyan-500/30 shadow-lg flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Align QR Code within target frame
              </div>
            </div>
          )}

          {/* Camera Loading / Requesting */}
          {cameraState === 'requesting' && (
            <div className="flex flex-col items-center gap-3 text-slate-300 p-6 text-center">
              <RefreshCw className="w-8 h-8 text-[#007BC4] animate-spin" />
              <p className="text-xs font-bold">Requesting camera permissions...</p>
              <p className="text-[11px] text-slate-500 max-w-xs">Please allow camera access in your browser prompt to scan QR badges.</p>
            </div>
          )}

          {/* Camera Error or Permission Denied */}
          {(cameraState === 'denied' || cameraState === 'error') && (
            <div className="p-6 text-center text-rose-400 flex flex-col items-center gap-2 max-w-sm">
              <AlertCircle size={32} className="text-rose-500" />
              <h4 className="font-bold text-sm text-white">Camera Offline or Restricted</h4>
              <p className="text-xs text-slate-400 mb-2">{errorMessage}</p>
              <button
                onClick={startCamera}
                className="px-4 py-1.5 bg-[#007BC4] text-white rounded-xl text-xs font-bold shadow hover:bg-blue-600 transition flex items-center gap-1.5"
              >
                <RefreshCw size={13} /> Retry Camera Initialization
              </button>
            </div>
          )}

          {/* Match Notification Banner over Video */}
          {scannedResult && (
            <div className="absolute bottom-3 left-3 right-3 p-3 bg-emerald-950/90 border border-emerald-500/50 rounded-2xl text-white backdrop-blur-md flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-emerald-500 text-slate-950 rounded-xl">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">QR Code Read Successful</div>
                  <div className="font-extrabold text-sm">{matchedWorker ? matchedWorker.name : `Code: ${scannedResult}`}</div>
                  <div className="text-[10px] text-emerald-200/80 font-mono">
                    {matchedWorker ? `Tag ID: ${matchedWorker.hardhatTagId || matchedWorker.id} • ${matchedWorker.tradeCompany}` : 'Searching database...'}
                  </div>
                </div>
              </div>

              {matchedWorker && (
                <button
                  onClick={() => {
                    stopCamera();
                    onWorkerFound(matchedWorker, scannedResult);
                  }}
                  className="px-3 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow hover:bg-emerald-400 transition"
                >
                  Open Profile
                </button>
              )}
            </div>
          )}

          {/* Top Controls Overlay on Camera Viewport */}
          {cameraState === 'active' && (
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
              {availableDevices.length > 1 ? (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-slate-900/80 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl border border-slate-700 outline-none cursor-pointer backdrop-blur-md"
                >
                  {availableDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              ) : <div />}

              <button
                onClick={toggleTorch}
                className={`p-2 rounded-xl border text-xs font-bold backdrop-blur-md transition ${
                  torchOn 
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.6)]' 
                    : 'bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800'
                }`}
                title="Toggle Torch / Flashlight"
              >
                <Zap size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Modal Scrollable Footer Controls & Simulator */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900/50">
          
          {/* Manual Input Bar */}
          <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
              <span>Manual QR / Barcode Tag Lookup</span>
              <span className="text-[10px] text-slate-400 font-normal">Type or paste code string</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualCode.trim()) {
                    handleCodeDetected(manualCode.trim());
                  }
                }}
                placeholder="e.g. HH-1042 or TAG-7091"
                className="flex-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#007BC4]"
              />
              <button
                onClick={() => {
                  if (manualCode.trim()) {
                    handleCodeDetected(manualCode.trim());
                  }
                }}
                className="px-4 py-2 bg-[#007BC4] hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow transition"
              >
                Lookup
              </button>
            </div>
          </div>

          {/* Quick Simulate Worker QR Badge Scan */}
          <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Sparkles size={14} className="text-[#007BC4]" />
                <span>Simulate Worker Badge Scan (1-Click Test)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{people.length} Registered</span>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 size-3.5" />
              <input
                type="text"
                value={testSearch}
                onChange={(e) => setTestSearch(e.target.value)}
                placeholder="Search registered site workers..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {simulatorPeople.map((p) => {
                const tag = (p.hardhatTagId || p.id).toUpperCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => handleCodeDetected(`GAO-RFID-WORKER:${tag}:${p.name}`)}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200/60 dark:border-slate-700/60 text-left transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-6 h-6 rounded-lg bg-[#007BC4]/10 text-[#007BC4] flex items-center justify-center font-bold text-xs shrink-0">
                        <User size={12} />
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-[#007BC4]">{p.name}</div>
                        <div className="text-[10px] font-mono text-[#007BC4]">{tag}</div>
                      </div>
                    </div>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono font-bold text-slate-600 dark:text-slate-300 group-hover:bg-[#007BC4] group-hover:text-white transition">
                      Scan
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Bottom Actions */}
        <div className="p-3 px-6 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="px-5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
          >
            Close Scanner
          </button>
        </div>

      </div>
    </div>
  );
}
