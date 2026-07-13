'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';
import {
  decodeQrFromImageData,
  decodeQrFromDataUrl,
  parseQrText,
  isMeaningfulQrContact,
  compressImageDataUrl,
} from '@/lib/qr';
import { analyseVideoFrame, fingerprintDistance, getCardCrop } from '@/lib/card-detection';

const MAX_CONCURRENT_SCANS = 2;
const USD_TO_INR = 84;

const PAGE_META = {
  contacts: { eyebrow: 'Relationship hub', title: 'My Contacts', subtitle: 'Search, organize and manage every connection.' },
  projects: { eyebrow: 'Event workspace', title: 'Projects & Exhibitions', subtitle: 'Keep every event and its visitors perfectly organized.' },
  media: { eyebrow: 'Asset library', title: 'Media Gallery', subtitle: 'Review card scans and linked visual assets.' },
  scan: { eyebrow: 'Smart capture', title: 'Scan Visitors', subtitle: 'Automatically detect cards and QR contacts.' },
  profile: { eyebrow: 'Personal settings', title: 'My Profile', subtitle: 'Manage your identity, photo and account security.' },
  admin: { eyebrow: 'Administration', title: 'Admin Console', subtitle: 'Manage users and platform access.' },
};

const createEmptyContact = (projectId = '') => ({
  name: '',
  title: '',
  company: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  address: '',
  notes: '',
  projectId: projectId || null,
  favorite: false,
});

export default function Dashboard() {
  const { data: session, update } = useSession();
  const router = useRouter();

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState('contacts'); // contacts | projects | scan | profile | admin
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Data state
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]); // Admin only
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [filterFavorite, setFilterFavorite] = useState(false);

  // Modals state
  const [viewContact, setViewContact] = useState(null);
  const [editContact, setEditContact] = useState(null); // object to edit or empty object to create
  const [projectModal, setProjectModal] = useState(null); // object to edit or empty object to create
  const [adminUserModal, setAdminUserModal] = useState(null); // user to edit/create
  const [mediaModal, setMediaModal] = useState(null); // media to edit/create
  const [viewLightbox, setViewLightbox] = useState(null); // full-screen preview image
  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [mediaLoading, setMediaLoading] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);

  // Camera & Scanner State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState({
    phase: 'ready',
    message: 'Place a QR code or business card inside the frame',
  });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraStartRef = useRef(false);
  const detectionRef = useRef({
    armed: true,
    stableCount: 0,
    stableFingerprint: null,
    capturedFingerprint: null,
    removedCount: 0,
    lastCaptureAt: 0,
    lastQrText: '',
  });
  const importFileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);
  const pageContentRef = useRef(null);

  // Profile Edit State
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [scanMode, setScanMode] = useState('rapid');
  const [bulkQueue, setBulkQueue] = useState([]); // { id, name, preview, qrFields, status, contact, costUsd, method, error }
  const [sessionStats, setSessionStats] = useState({ count: 0, qr: 0, ai: 0, costUsd: 0 });
  const [qrFlash, setQrFlash] = useState(false);
  const inFlightRef = useRef(new Set());
  const projectIdRef = useRef('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showAdminUserPassword, setShowAdminUserPassword] = useState(false);
  const [mediaFilter, setMediaFilter] = useState('all');
  const [mediaSort, setMediaSort] = useState('newest');
  const [mediaDensity, setMediaDensity] = useState('standard');

  const openNewContact = () => {
    setViewContact(null);
    setEditContact(createEmptyContact(selectedProjectId));
  };

  const openContacts = (favoritesOnly = false) => {
    stopCamera();
    setFilterFavorite(favoritesOnly);
    setSelectedProjectId('');
    setActiveTab('contacts');
    setMobileMenuOpen(false);
  };

  const openNavigationTab = (tab) => {
    if (tab === 'scan') {
      openScanner();
      return;
    }
    stopCamera();
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const openDataTools = () => {
    setMobileMenuOpen(false);
    setToolsModalOpen(true);
  };

  // Each bottom-dock destination should open at its actionable top, even if
  // the previous mobile page was scrolled deep into a long form or list.
  useEffect(() => {
    pageContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  // Prevent the page behind a mobile bottom sheet from moving while its own
  // body remains independently scrollable.
  useEffect(() => {
    const modalOpen = Boolean(
      viewContact || editContact || projectModal || adminUserModal
      || mediaModal || viewLightbox || toolsModalOpen
    );
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [viewContact, editContact, projectModal, adminUserModal, mediaModal, viewLightbox, toolsModalOpen]);

  // ---------------- FETCHING DATA ----------------
  const fetchContacts = async () => {
    try {
      let url = `/api/contacts?q=${encodeURIComponent(searchQuery)}`;
      if (selectedProjectId) url += `&projectId=${selectedProjectId}`;
      if (filterFavorite) url += `&favorite=true`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    if (session?.user?.role !== 'admin') return;
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMedia = async () => {
    try {
      const res = await fetch('/api/media');
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch media:', err);
    }
  };

  const handleSaveMedia = async (e) => {
    e.preventDefault();
    if (!mediaModal.title) {
      showToast('Title is required', 'error');
      return;
    }
    if (!mediaModal.id && !mediaModal.base64Data) {
      showToast('Image file is required', 'error');
      return;
    }

    setMediaLoading(true);
    try {
      const isEdit = !!mediaModal.id;
      const url = isEdit ? `/api/media/${mediaModal.id}` : '/api/media';
      const method = isEdit ? 'PUT' : 'POST';

      const body = {
        title: mediaModal.title,
        contactId: mediaModal.contactId || '',
      };
      if (mediaModal.base64Data) {
        body.base64Data = mediaModal.base64Data;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(isEdit ? 'Media updated successfully' : 'Media uploaded successfully');
        setMediaModal(null);
        fetchMedia();
        fetchContacts();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save media', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Something went wrong', 'error');
    } finally {
      setMediaLoading(false);
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    if (!confirm('Are you sure you want to delete this media file? This will remove it from storage and unlink any contact.')) return;

    try {
      const res = await fetch(`/api/media/${mediaId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Media deleted successfully');
        fetchMedia();
        fetchContacts();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to delete media', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Something went wrong', 'error');
    }
  };

  useEffect(() => {
    if (session) {
      const frame = requestAnimationFrame(() => {
        setProfileName(session.user.name || '');
        setProfileEmail(session.user.email || '');
        Promise.all([fetchContacts(), fetchProjects(), fetchUsers(), fetchMedia()]).finally(() => {
          setLoading(false);
        });
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
    // Data functions intentionally use the current filters from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, searchQuery, selectedProjectId, filterFavorite, activeTab]);

  const showToast = (message, type = 'success') => {
    setToast(previous => ({ message, type, id: (previous.id || 0) + 1 }));
  };

  const stopCamera = () => {
    const stream = cameraStreamRef.current || videoRef.current?.srcObject;
    stream?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    cameraStartRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraStarting(false);
  };

  const startCamera = async () => {
    if (cameraStartRef.current || cameraStreamRef.current?.active) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanFeedback({ phase: 'error', message: 'Camera is not supported in this browser. Upload card photos instead.' });
      return;
    }

    cameraStartRef.current = true;
    // Mount the video element immediately. Previously it was rendered only
    // after a stream was attached, while stream attachment waited for the
    // element, causing a first-open deadlock on mobile.
    setCameraActive(true);
    setCameraStarting(true);
    setScanFeedback({ phase: 'ready', message: 'Starting camera automatically. Allow camera access if prompted...' });
    let permissionTimer;
    let permissionTimedOut = false;
    try {
      const mediaRequest = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      mediaRequest.then(stream => {
        if (permissionTimedOut) stream.getTracks().forEach(track => track.stop());
      }).catch(() => undefined);
      const stream = await Promise.race([
        mediaRequest,
        new Promise((_, reject) => {
          permissionTimer = setTimeout(() => {
            permissionTimedOut = true;
            reject(new Error('Camera permission timed out'));
          }, 12000);
        }),
      ]);
      cameraStreamRef.current = stream;
      let video = videoRef.current;
      for (let attempt = 0; !video && attempt < 4; attempt += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        video = videoRef.current;
      }
      if (!video) {
        throw new Error('Camera preview could not be initialized');
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      detectionRef.current = {
        armed: true,
        stableCount: 0,
        stableFingerprint: null,
        capturedFingerprint: null,
        removedCount: 0,
        lastCaptureAt: 0,
        lastQrText: '',
      };
      setCameraActive(true);
      setScanFeedback({
        phase: 'ready',
        message: projectIdRef.current
          ? 'Place a QR code or business card inside the frame'
          : 'Camera ready. Select a project or exhibition to start saving contacts.',
      });
    } catch (err) {
      console.error('Camera access failed:', err);
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      setCameraActive(false);
      setScanFeedback({ phase: 'error', message: 'Camera access was blocked. Allow camera permission or upload photos.' });
      showToast('Camera access was blocked. Please allow permission or upload photos.', 'error');
    } finally {
      clearTimeout(permissionTimer);
      cameraStartRef.current = false;
      setCameraStarting(false);
    }
  };

  const openScanner = () => {
    setScanMode('rapid');
    setScanPreview(null);
    setMobileMenuOpen(false);
    setActiveTab('scan');
    // Run from the actual camera-button gesture so browsers can grant/open the
    // camera immediately. The tab effect remains as a safe fallback.
    startCamera();
  };

  // ---------------- BACKGROUND SCAN QUEUE ----------------
  // Every captured/selected image lands in the queue and is processed in the
  // background (QR decode first — free & exact; AI fallback). Nothing is kept
  // locally: each item is uploaded to Cloudinary and saved as Contact + Media.
  const updateQueueItem = (id, patch) => {
    setBulkQueue(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
  };

  // The live detector fires several times per second; keeping the previous
  // state object when nothing changed lets React skip re-rendering the page.
  const setScanFeedbackIfChanged = (phase, message) => {
    setScanFeedback(prev => (prev.phase === phase && prev.message === message ? prev : { phase, message }));
  };

  const enqueueScans = (items) => {
    const stamped = items.map((it, idx) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${idx}`;
      return {
        id,
        requestId: id,
        name: it.name || `Scan ${new Date().toLocaleTimeString()}`,
        preview: it.preview,
        qrFields: it.qrFields || null,
        source: it.source || 'upload',
        status: 'queued', // queued | processing | success | failed
        contact: null,
        costUsd: null,
        method: null,
        error: null,
      };
    });
    setBulkQueue(prev => [...stamped, ...prev]);
  };

  const runScanItem = async (item) => {
    updateQueueItem(item.id, { status: 'processing' });
    try {
      let qrFields = item.qrFields;
      if (!qrFields) {
        const qrText = await decodeQrFromDataUrl(item.preview);
        if (qrText) {
          const parsed = parseQrText(qrText);
          if (isMeaningfulQrContact(parsed)) qrFields = { ...parsed.fields, notes: `Scanned via QR code (${parsed.kind})` };
        }
      }
      const image = await compressImageDataUrl(item.preview);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          qr: qrFields,
          projectId: projectIdRef.current || null,
          autoSave: true,
          requestId: item.requestId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');

      updateQueueItem(item.id, { status: 'success', contact: data.contact, costUsd: data.costUsd, method: data.method });
      setSessionStats(prev => ({
        count: prev.count + 1,
        qr: prev.qr + (data.method === 'qr' ? 1 : 0),
        ai: prev.ai + (data.method === 'ai' ? 1 : 0),
        costUsd: prev.costUsd + (data.costUsd || 0),
      }));
      fetchContacts();
      fetchMedia();
      fetchProjects();
      setScanFeedback({ phase: 'saved', message: 'Contact saved. Show the next card when ready.' });
      showToast('Contact details extracted and saved successfully.', 'success');
    } catch (err) {
      updateQueueItem(item.id, { status: 'failed', error: err.message });
      setScanFeedback({ phase: 'error', message: err.message || 'Could not read this card. Try again.' });
      showToast(err.message || 'Could not read this card. Try again.', 'error');
    } finally {
      inFlightRef.current.delete(item.id);
    }
  };

  const retryQueueItem = (id) => updateQueueItem(id, { status: 'queued', error: null });
  const clearFinishedQueue = () => setBulkQueue(prev => prev.filter(i => i.status === 'queued' || i.status === 'processing'));

  const grabVideoFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = canvasRef.current;
    const crop = getCardCrop(video.videoWidth, video.videoHeight);
    // Capture at upload size directly so compressImageDataUrl becomes a no-op —
    // full-res capture plus a second decode/encode caused visible jank on mobile.
    const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));
    canvas.width = Math.round(crop.width * scale);
    canvas.height = Math.round(crop.height * scale);
    canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const captureForBackground = (qrFields = null, name = '', capturedAt = null) => {
    if (!projectIdRef.current) {
      setScanFeedback({ phase: 'error', message: 'Select a project or exhibition before scanning.' });
      showToast('Select a project or exhibition before scanning.', 'error');
      return;
    }
    const frame = grabVideoFrame();
    if (!frame) return;
    const detection = detectionRef.current;
    detection.armed = false;
    const liveAnalysis = analyseVideoFrame(videoRef.current, document.createElement('canvas'));
    detection.capturedFingerprint = liveAnalysis?.fingerprint || detection.stableFingerprint;
    detection.lastCaptureAt = capturedAt ?? Number.POSITIVE_INFINITY;
    if (navigator.vibrate) navigator.vibrate(40);
    setQrFlash(true);
    setTimeout(() => setQrFlash(false), 350);
    enqueueScans([{ preview: frame, qrFields, name, source: 'camera' }]);
    setScanFeedback({ phase: 'captured', message: 'Photo captured. Extracting details in the background...' });
    showToast('Photo captured. Details are being extracted in the background.', 'success');
  };

  // Keep a ref of the selected project for the background queue workers
  useEffect(() => { projectIdRef.current = selectedProjectId; }, [selectedProjectId]);

  useEffect(() => {
    if (activeTab === 'scan') {
      const frame = requestAnimationFrame(() => startCamera());
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => stopCamera());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => () => {
    const stream = cameraStreamRef.current || videoRef.current?.srcObject;
    stream?.getTracks().forEach(track => track.stop());
  }, []);

  // Auto-run the scan queue with limited concurrency whenever items are waiting
  useEffect(() => {
    const active = bulkQueue.filter(i => i.status === 'processing').length;
    const slots = MAX_CONCURRENT_SCANS - active;
    if (slots <= 0) return;
    bulkQueue
      .filter(i => i.status === 'queued' && !inFlightRef.current.has(i.id))
      .slice(0, slots)
      .forEach(item => {
        inFlightRef.current.add(item.id);
        runScanItem(item);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkQueue]);

  /* Legacy QR-only detector retained in history; replaced by unified detector.
  // Live QR auto-detect: while the camera runs, sample frames ~3x/sec. The
  // moment a contact QR appears it is captured and saved automatically.
  useEffect(() => {
    if (!cameraActive || activeTab !== 'scan') return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      let text = null;
      try {
        text = decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch { return; }
      if (!text) return;

      const now = Date.now();
      if (text === lastQrRef.current.text && now - lastQrRef.current.at < 5000) return; // same QR debounce
      lastQrRef.current = { text, at: now };

      const parsed = parseQrText(text);
      if (!isMeaningfulQrContact(parsed)) {
        showToast('QR detected, but it has no contact info', 'error');
        return;
      }
      const frame = grabVideoFrame();
      if (!frame) return;
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      setQrFlash(true);
      setTimeout(() => setQrFlash(false), 350);
      enqueueScans([{ preview: frame, qrFields: { ...parsed.fields, notes: `Scanned via QR code (${parsed.kind})` }, name: parsed.fields.name || 'QR Contact' }]);
      showToast(`QR captured: ${parsed.fields.name || parsed.fields.company || 'contact'} — saving...`, 'success');
    }, 320);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, activeTab]); */

  // One continuous detector handles both QR codes and printed cards. Printed
  // cards are captured only after four sharp, stable frames. The detector is
  // re-armed after the saved card leaves the guide, preventing duplicates.
  useEffect(() => {
    if (!cameraActive || activeTab !== 'scan') return;
    const qrCanvas = document.createElement('canvas');
    const qrContext = qrCanvas.getContext('2d', { willReadFrequently: true });
    const analysisCanvas = document.createElement('canvas');

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
      qrCanvas.width = Math.round(video.videoWidth * scale);
      qrCanvas.height = Math.round(video.videoHeight * scale);
      qrContext.drawImage(video, 0, 0, qrCanvas.width, qrCanvas.height);

      let qrText = null;
      try {
        qrText = decodeQrFromImageData(qrContext.getImageData(0, 0, qrCanvas.width, qrCanvas.height), 'dontInvert');
      } catch {
        return;
      }

      const state = detectionRef.current;
      const now = Date.now();
      const analysis = analyseVideoFrame(video, analysisCanvas);
      if (!analysis) return;

      if (!projectIdRef.current) {
        state.stableCount = 0;
        state.stableFingerprint = null;
        setScanFeedbackIfChanged('ready', 'Select a project or exhibition to start saving contacts.');
        return;
      }

      if (qrText) {
        const parsed = parseQrText(qrText);
        if (!isMeaningfulQrContact(parsed)) {
          setScanFeedbackIfChanged('detecting', 'QR detected, but it does not contain contact information.');
          return;
        }
        if (state.armed && qrText !== state.lastQrText && now - state.lastCaptureAt > 1200) {
          state.armed = false;
          state.lastQrText = qrText;
          state.capturedFingerprint = analysis.fingerprint;
          state.lastCaptureAt = now;
          captureForBackground(
            { ...parsed.fields, notes: `Scanned via QR code (${parsed.kind})` },
            parsed.fields.name || parsed.fields.company || 'QR Contact',
            now,
          );
        } else {
          setScanFeedbackIfChanged('saved', 'This QR is already captured. Show the next card.');
        }
        return;
      }

      const distanceFromCaptured = fingerprintDistance(analysis.fingerprint, state.capturedFingerprint);
      if (!state.armed) {
        if (!analysis.cardLike || distanceFromCaptured > 18) state.removedCount += 1;
        else state.removedCount = 0;

        if (state.removedCount >= 3) {
          state.armed = true;
          state.removedCount = 0;
          state.stableCount = 0;
          state.stableFingerprint = null;
          state.lastQrText = '';
          state.lastCaptureAt = 0;
          setScanFeedbackIfChanged('ready', 'Ready. Place the next QR code or business card inside the frame.');
        }
        return;
      }

      if (!analysis.cardLike) {
        state.stableCount = 0;
        state.stableFingerprint = null;
        setScanFeedbackIfChanged('ready', 'Place a QR code or business card inside the frame');
        return;
      }

      const stability = fingerprintDistance(analysis.fingerprint, state.stableFingerprint);
      state.stableCount = stability < 5.5 ? state.stableCount + 1 : 1;
      state.stableFingerprint = analysis.fingerprint;
      setScanFeedbackIfChanged('detecting', `Business card detected. Hold steady${'.'.repeat(Math.min(state.stableCount, 3))}`);

      if (state.stableCount >= 4 && now - state.lastCaptureAt > 1800) {
        state.armed = false;
        state.capturedFingerprint = analysis.fingerprint;
        state.lastCaptureAt = now;
        state.stableCount = 0;
        captureForBackground(null, '', now);
      }
    }, 420);

    return () => clearInterval(timer);
    // Detector helpers intentionally use the latest refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, activeTab]);

  // ---------------- AUTH CHECK ----------------
  if (!session) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
        <div className="spinner" style={{ borderColor: 'var(--red)', borderTopColor: 'transparent', width: '40px', height: '40px' }}></div>
      </div>
    );
  }

  const triggerBulkUpload = () => {
    bulkFileInputRef.current?.click();
  };

  // Compatibility handlers for an existing in-progress single scan. New scan
  // sessions always use the unified rapid flow below.
  const capturePhoto = () => {
    const frame = grabVideoFrame();
    if (frame) setScanPreview(frame);
  };

  const triggerScanUpload = () => fileInputRef.current?.click();

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ({ target }) => setScanPreview(target.result);
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExtractCard = () => {
    if (!scanPreview) return;
    setScanning(true);
    enqueueScans([{ preview: scanPreview, source: 'upload' }]);
    setScanPreview(null);
    setScanning(false);
  };

  const handleBulkFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!selectedProjectId) {
      showToast('Select a project or exhibition before uploading cards.', 'error');
      e.target.value = '';
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => enqueueScans([{ name: file.name, preview: event.target.result }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDownloadBulkCSV = () => {
    if (!selectedProjectId) {
      showToast('Select a project or exhibition to download its CSV.', 'error');
      return;
    }
    window.open(`/api/export?format=csv&projectId=${encodeURIComponent(selectedProjectId)}`, '_blank');
  };

  const handleDownloadProjectCSV = (projectId) => {
    window.open(`/api/export?format=csv&projectId=${encodeURIComponent(projectId)}`, '_blank');
  };

  /* Removed single-shot review flow; unified scanner auto-saves instead.
  // Single scan: QR-first extract, auto-saved to DB + Media on the server,
  // then opened in the edit modal for review.
  const handleExtractCard = async () => {
    if (!scanPreview) return;
    setScanning(true);
    try {
      let qrFields = null;
      const qrText = await decodeQrFromDataUrl(scanPreview);
      if (qrText) {
        const parsed = parseQrText(qrText);
        if (isMeaningfulQrContact(parsed)) qrFields = { ...parsed.fields, notes: `Scanned via QR code (${parsed.kind})` };
      }
      const image = await compressImageDataUrl(scanPreview);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, qr: qrFields, projectId: selectedProjectId || null, autoSave: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract card details');

      setScanning(false);
      setScanPreview(null);
      setSessionStats(prev => ({
        count: prev.count + 1,
        qr: prev.qr + (data.method === 'qr' ? 1 : 0),
        ai: prev.ai + (data.method === 'ai' ? 1 : 0),
        costUsd: prev.costUsd + (data.costUsd || 0),
      }));
      setEditContact(data.contact);
      fetchContacts();
      fetchMedia();
      fetchProjects();
      showToast(data.method === 'qr' ? 'QR contact saved — FREE scan!' : `Card saved! AI cost $${(data.costUsd || 0).toFixed(4)}`, 'success');
    } catch (err) {
      setScanning(false);
      showToast(err.message, 'error');
    }
  };

  */
  const formatCost = (usd) => {
    if (!usd) return 'FREE';
    return `$${usd.toFixed(4)} (~₹${(usd * USD_TO_INR).toFixed(2)})`;
  };

  const pendingScans = bulkQueue.filter(i => i.status === 'queued' || i.status === 'processing').length;
  const selectedDestination = projects.find(project => project._id === selectedProjectId) || null;

  const renderQueueTray = () => {
    if (bulkQueue.length === 0) return null;
    return (
      <div className="scan-queue-tray">
        <div className="scan-queue-head">
          <h3>
            <i className="fas fa-layer-group"></i> Scan Queue
            {pendingScans > 0 && <span className="queue-live-badge"><span className="live-dot"></span>{pendingScans} processing</span>}
          </h3>
          <button className="queue-clear-btn" onClick={clearFinishedQueue} disabled={bulkQueue.every(i => i.status === 'queued' || i.status === 'processing')}>
            <i className="fas fa-broom"></i> Clear done
          </button>
        </div>
        <div className="scan-queue-list">
          {bulkQueue.map(item => (
            <div key={item.id} className={`scan-queue-item ${item.status}`}>
              <img src={item.preview} alt="scan" />
              <div className="scan-queue-info">
                <h4>{item.status === 'success' && item.contact ? item.contact.name : item.name}</h4>
                {item.status === 'queued' && <span className="q-status"><i className="fas fa-clock"></i> Waiting in queue...</span>}
                {item.status === 'processing' && <span className="q-status processing"><i className="fas fa-spinner fa-spin"></i> Extracting & saving...</span>}
                {item.status === 'success' && (
                  <span className="q-status success">
                    <i className="fas fa-check-circle"></i> Saved to contacts
                    {item.contact?.company ? ` • ${item.contact.company}` : ''}
                  </span>
                )}
                {item.status === 'failed' && <span className="q-status failed"><i className="fas fa-exclamation-circle"></i> {item.error}</span>}
              </div>
              {item.status === 'success' && (
                <span className={`cost-chip ${item.method === 'qr' ? 'free' : ''}`}>
                  {item.method === 'qr' ? <><i className="fas fa-qrcode"></i> FREE</> : `$${(item.costUsd || 0).toFixed(4)}`}
                </span>
              )}
              {item.status === 'failed' && (
                <button className="queue-retry-btn" onClick={() => retryQueueItem(item.id)} title="Retry">
                  <i className="fas fa-rotate-right"></i>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSessionStats = () => {
    if (sessionStats.count === 0) return null;
    return (
      <div className="session-cost-strip">
        <div className="session-stat"><strong>{sessionStats.count}</strong><span>Scans</span></div>
        <div className="session-stat free"><strong>{sessionStats.qr}</strong><span>QR (Free)</span></div>
        <div className="session-stat"><strong>{sessionStats.ai}</strong><span>AI Scans</span></div>
        <div className="session-stat cost"><strong>{sessionStats.costUsd ? `$${sessionStats.costUsd.toFixed(4)}` : '$0'}</strong><span>≈ ₹{(sessionStats.costUsd * USD_TO_INR).toFixed(2)} total</span></div>
      </div>
    );
  };

  // ---------------- CONTACT CRUD OPERATIONS ----------------
  const handleSaveContact = async (e) => {
    e.preventDefault();
    try {
      const isNew = !editContact._id;
      const url = isNew ? '/api/contacts' : `/api/contacts/${editContact._id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editContact)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save contact');

      showToast(isNew ? 'Contact added successfully!' : 'Contact updated!', 'success');
      setEditContact(null);
      fetchContacts();
      fetchProjects(); // Update project counts
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteContact = async (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Contact deleted', 'success');
        setViewContact(null);
        setEditContact(null);
        fetchContacts();
        fetchProjects();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleFavorite = async (contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !contact.favorite })
      });
      if (res.ok) {
        showToast(contact.favorite ? 'Removed from favorites' : 'Added to favorites', 'success');
        fetchContacts();
        if (viewContact && viewContact._id === contact._id) {
          setViewContact({ ...viewContact, favorite: !contact.favorite });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ---------------- PROJECT OPERATIONS ----------------
  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      const isNew = !projectModal._id;
      const url = isNew ? '/api/projects' : `/api/projects/${projectModal._id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectModal)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save project');

      setSelectedProjectId(data._id);
      setScanFeedback({ phase: 'ready', message: `${data.name} selected. Ready to scan contacts.` });
      showToast(isNew ? `${data.type === 'exhibition' ? 'Exhibition' : 'Project'} created and selected!` : 'Project / exhibition updated!', 'success');
      setProjectModal(null);
      fetchProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteProject = async (id) => {
    if (!confirm('Delete this project / exhibition? Contacts inside will not be deleted; they will become unorganized.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Project deleted', 'success');
        setProjectModal(null);
        if (selectedProjectId === id) setSelectedProjectId('');
        fetchProjects();
        fetchContacts();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete project');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ---------------- USER PROFILE MANAGEMENT ----------------
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const payload = { name: profileName, email: profileEmail };
      if (currentPassword && newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      showToast('Profile updated successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      // Update local NextAuth session
      await update({ name: data.name, avatar: data.avatar });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      setProfileLoading(true);
      try {
        const res = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar: event.target.result })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Avatar upload failed');

        showToast('Avatar updated!', 'success');
        await update({ name: session.user.name, avatar: data.avatar });
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setProfileLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ---------------- ADMIN PANEL USERS OPERATIONS ----------------
  const handleSaveAdminUser = async (e) => {
    e.preventDefault();
    try {
      const isNew = !adminUserModal._id;
      const url = isNew ? '/api/admin/users' : `/api/admin/users/${adminUserModal._id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminUserModal)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');

      showToast(isNew ? 'User created!' : 'User updated!', 'success');
      setAdminUserModal(null);
      fetchUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteAdminUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user? ALL of their saved contacts will be deleted permanently.')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('User and data deleted', 'success');
        setAdminUserModal(null);
        fetchUsers();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ---------------- EXPORTS & IMPORTS ----------------
  const handleExport = (format) => {
    let url = `/api/export?format=${format}`;
    if (selectedProjectId) url += `&projectId=${selectedProjectId}`;
    window.open(url, '_blank');
    setToolsModalOpen(false);
    showToast(`Exported as ${format.toUpperCase()}`, 'success');
  };

  const triggerImportClick = (accept) => {
    if (importFileInputRef.current) {
      importFileInputRef.current.accept = accept;
      importFileInputRef.current.click();
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setToolsModalOpen(false);
    const extension = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = event.target.result;
      try {
        let importedList = [];
        if (extension === 'json') {
          const parsed = JSON.parse(content);
          importedList = Array.isArray(parsed) ? parsed : [parsed];
        } else if (extension === 'csv') {
          importedList = parseCSVContent(content);
        } else if (extension === 'vcf') {
          importedList = parseVCFContent(content);
        }

        if (importedList.length === 0) {
          throw new Error('No valid contact entries found to import.');
        }

        // Upload imported contacts one by one
        let importedCount = 0;
        for (let item of importedList) {
          if (!item.name && !item.email && !item.phone) continue;
          const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name || 'Imported User',
              title: item.title || '',
              company: item.company || '',
              phone: item.phone || '',
              mobile: item.mobile || '',
              email: item.email || '',
              website: item.website || '',
              address: item.address || '',
              notes: item.notes || 'Imported file',
              scanMethod: 'import',
              projectId: selectedProjectId || null
            })
          });
          if (res.ok) importedCount++;
        }

        showToast(`Successfully imported ${importedCount} contacts!`, 'success');
        fetchContacts();
        fetchProjects();
      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const parseCSVContent = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const keys = ['name', 'title', 'company', 'phone', 'mobile', 'email', 'website', 'address', 'notes'];
    const list = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length === 0) continue;
      const obj = {};
      keys.forEach((key, index) => {
        obj[key] = (row[index] || '').trim();
      });
      list.push(obj);
    }
    return list;
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  };

  const parseVCFContent = (text) => {
    const cards = text.split('BEGIN:VCARD').filter(card => card.includes('END:VCARD'));
    const list = [];
    cards.forEach(card => {
      const obj = { name: '', title: '', company: '', phone: '', mobile: '', email: '', website: '', address: '', notes: '' };
      const lines = card.split('\n');
      lines.forEach(line => {
        const l = line.trim();
        if (l.startsWith('FN:')) obj.name = l.slice(3);
        else if (l.startsWith('TITLE:')) obj.title = l.slice(6);
        else if (l.startsWith('ORG:')) obj.company = l.slice(4);
        else if (l.includes('TEL') && l.includes('CELL')) obj.mobile = l.split(':').pop();
        else if (l.includes('TEL')) obj.phone = l.split(':').pop();
        else if (l.startsWith('EMAIL')) obj.email = l.split(':').pop();
        else if (l.startsWith('URL')) obj.website = l.split(':').slice(1).join(':');
        else if (l.startsWith('ADR')) obj.address = l.split(':').pop().replace(/;/g, ' ').trim();
        else if (l.startsWith('NOTE:')) obj.notes = l.slice(5);
      });
      if (obj.name || obj.email || obj.phone) {
        list.push(obj);
      }
    });
    return list;
  };

  // ---------------- HELPERS ----------------
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const currentPage = PAGE_META[activeTab] || PAGE_META.contacts;

  return (
    <div className="dashboard">
      {toast.message && <Toast key={toast.id} message={toast.message} type={toast.type} />}

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)} aria-hidden="true"></div>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand-lockup">
            <img src="/assets/logo-full.png" alt="OnePWS logo" />
            <span>CardScan Workspace</span>
          </div>
          <button type="button" className="sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu">
            <span></span><span></span>
          </button>
        </div>

        <div className="sidebar-workspace-card">
          <span className="workspace-card-icon"><i className="fas fa-wand-magic-sparkles"></i></span>
          <div>
            <strong>Smart lead capture</strong>
            <small>{contacts.length} contacts across {projects.length} workspaces</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Workspace</div>
          <button className={`nav-item ${activeTab === 'contacts' && !filterFavorite ? 'active' : ''}`} onClick={() => openContacts(false)}>
            <i className="fas fa-address-book"></i>
            <span>All Contacts</span>
            <span className="badge">{contacts.length}</span>
          </button>
          <button className={`nav-item ${activeTab === 'contacts' && filterFavorite ? 'active' : ''}`} onClick={() => openContacts(true)}>
            <i className="fas fa-star"></i>
            <span>Favorites</span>
            <span className="badge subtle">{contacts.filter(contact => contact.favorite).length}</span>
          </button>
          <button className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => openNavigationTab('projects')}>
            <i className="fas fa-calendar-days"></i>
            <span>Projects / Exhibitions</span>
            <span className="badge">{projects.length}</span>
          </button>
          <button className={`nav-item nav-item-scan ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => openNavigationTab('scan')}>
            <i className="fas fa-camera"></i>
            <span>Smart Scanner</span>
            <em>Auto</em>
          </button>
          <button className={`nav-item ${activeTab === 'media' ? 'active' : ''}`} onClick={() => openNavigationTab('media')}>
            <i className="fas fa-photo-film"></i>
            <span>Media Gallery</span>
            <span className="badge">{mediaItems.length}</span>
          </button>

          <div className="nav-section">Data tools</div>
          <button className="nav-item" onClick={openDataTools}>
            <i className="fas fa-arrow-right-arrow-left"></i>
            <span>Import / Export</span>
          </button>
          <button className="nav-item" onClick={() => { setMobileMenuOpen(false); handleExport('csv'); }}>
            <i className="fas fa-file-arrow-down"></i>
            <span>Download CSV</span>
          </button>

          <div className="nav-section">Account</div>
          <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => openNavigationTab('profile')}>
            <i className="fas fa-user-gear"></i>
            <span>My Profile</span>
          </button>

          {session.user.role === 'admin' && (
            <button className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => openNavigationTab('admin')}>
              <i className="fas fa-shield-halved"></i>
              <span>User Management</span>
              <em>Admin</em>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="user-info" onClick={() => openNavigationTab('profile')}>
            <div className="user-avatar">
              {session.user.avatar ? <img src={session.user.avatar} alt="avatar" /> : getInitials(session.user.name)}
            </div>
            <div className="user-details">
              <h4>{session.user.name}</h4>
              <p>{session.user.role === 'admin' ? 'Administrator' : 'Standard User'}</p>
            </div>
            <i className="fas fa-chevron-right user-chevron"></i>
          </button>
          <button className="nav-item nav-item-logout" onClick={() => signOut({ callbackUrl: '/login' })}>
            <i className="fas fa-sign-out-alt"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-leading">
            <button
              type="button"
              className={`mobile-menu-trigger ${mobileMenuOpen ? 'open' : ''}`}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className="menu-line"></span>
              <span className="menu-line short"></span>
              <span className="menu-line"></span>
            </button>
            <div className="header-brand-mobile">
              <img src="/assets/logo-icon.png" alt="OnePWS" className="mobile-logo-icon" />
            </div>
            <div className="header-title-block">
              <span>{currentPage.eyebrow}</span>
              <h1>{currentPage.title}</h1>
              <p>{currentPage.subtitle}</p>
            </div>
          </div>

          <div className={`top-header-actions header-actions-${activeTab}`}>
            {activeTab === 'contacts' && (
              <>
                <div className="header-search">
                  <i className="fas fa-search"></i>
                  <input
                    type="text"
                    placeholder="Search name, company, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className={`icon-btn header-favorite-action ${filterFavorite ? 'active' : ''}`} onClick={() => setFilterFavorite(!filterFavorite)} title="Filter Favorites" aria-label="Filter favorite contacts">
                  <i className="fas fa-star"></i>
                </button>
                <button className="icon-btn header-secondary-action" onClick={openDataTools} title="Import / Export Data" aria-label="Open import and export tools">
                  <i className="fas fa-file-import"></i>
                </button>
                <button className="icon-btn header-secondary-action" onClick={() => handleExport('csv')} title="Download all contacts as CSV" aria-label="Download all contacts as CSV">
                  <i className="fas fa-file-csv"></i>
                </button>
                <button className="btn-sm btn-quick-scan" onClick={openScanner}>
                  <i className="fas fa-camera"></i>
                  <span>Quick Scan</span>
                </button>
              </>
            )}

            {activeTab === 'media' && (
              <>
                <div className="header-search">
                  <i className="fas fa-search"></i>
                  <input
                    type="text"
                    placeholder="Search media files..."
                    value={mediaSearchQuery}
                    onChange={(e) => setMediaSearchQuery(e.target.value)}
                  />
                </div>
                <button className="btn-sm header-media-upload" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })}>
                  <i className="fas fa-upload"></i>
                  <span>Upload Media</span>
                </button>
              </>
            )}
            <button type="button" className="header-profile-button" onClick={() => openNavigationTab('profile')} aria-label="Open profile">
              <span className="header-profile-avatar">
                {session.user.avatar ? <img src={session.user.avatar} alt="" /> : getInitials(session.user.name)}
              </span>
              <span className="header-profile-copy"><strong>{session.user.name}</strong><small>{session.user.role}</small></span>
              <i className="fas fa-chevron-down"></i>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content" ref={pageContentRef}>
          {loading ? (
            <div style={{ display: 'flex', flex: 1, height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ borderColor: 'var(--red)', borderTopColor: 'transparent', width: '32px', height: '32px' }}></div>
            </div>
          ) : (
            <>
              {/* ============ CONTACTS TAB ============ */}
              {activeTab === 'contacts' && (
                <div>
                  <div className="contacts-page-actions">
                    <div className="contacts-page-copy">
                      <strong>Contact directory</strong>
                      <span>Add, open, edit, favorite, and export contacts.</span>
                    </div>
                    <div className="contacts-action-buttons">
                      <button type="button" className="btn-outline contacts-tools-button" onClick={() => setToolsModalOpen(true)} aria-label="Open import and export tools">
                        <i className="fas fa-arrow-right-arrow-left"></i><span>Import / Export</span>
                      </button>
                      <button type="button" className="btn-sm" onClick={openNewContact} aria-label="Add new contact">
                        <i className="fas fa-user-plus"></i> Add Contact
                      </button>
                    </div>
                  </div>
                  {selectedProjectId && (
                    <button className="context-back" onClick={() => { setSelectedProjectId(''); setActiveTab('projects'); }}>
                      <i className="fas fa-arrow-left"></i>
                      Back to Projects
                    </button>
                  )}
                  {/* Project Selector pill row */}
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '8px' }}>
                    <button
                      className={`btn-outline ${!selectedProjectId ? 'active' : ''}`}
                      onClick={() => setSelectedProjectId('')}
                      style={{
                        background: !selectedProjectId ? 'var(--red-light)' : '#fff',
                        borderColor: !selectedProjectId ? 'var(--red)' : '',
                        color: !selectedProjectId ? 'var(--red)' : '',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      All Contacts
                    </button>
                    {projects.map(p => (
                      <button
                        key={p._id}
                        className={`btn-outline ${selectedProjectId === p._id ? 'active' : ''}`}
                        onClick={() => setSelectedProjectId(p._id)}
                        style={{
                          background: selectedProjectId === p._id ? 'var(--red-light)' : '#fff',
                          borderColor: selectedProjectId === p._id ? 'var(--red)' : '',
                          color: selectedProjectId === p._id ? 'var(--red)' : '',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {contacts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fas fa-id-card"></i></div>
                      <h2>No contacts found</h2>
                      <p>Try resetting filters, searching for something else, or scan a new business card.</p>
                      <button className="btn-primary" onClick={openScanner} style={{ maxWidth: '200px', margin: '0 auto' }}>
                        <i className="fas fa-camera"></i> Scan Card Now
                      </button>
                    </div>
                  ) : (
                    <div className="contact-grid">
                      {contacts.map(c => (
                        <div
                          key={c._id}
                          className="contact-row"
                          role="button"
                          tabIndex={0}
                          aria-label={`Open contact ${c.name}`}
                          onClick={() => setViewContact(c)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setViewContact(c);
                            }
                          }}
                        >
                          <div className="contact-avatar">{getInitials(c.name)}</div>
                          <div className="contact-details">
                            <h3>{c.name}</h3>
                            {c.company && <p className="company">{c.company}</p>}
                            <p className="meta">{c.title ? `${c.title} • ` : ''}{c.email || c.phone || 'No contact details'}</p>
                          </div>
                          <div className="contact-actions" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setViewContact(c)} title="Open contact details" aria-label={`Open ${c.name}`}>
                              <i className="fas fa-chevron-right"></i>
                            </button>
                            {c.phone && (
                              <button onClick={() => window.open(`tel:${c.phone}`)} title="Call Working Phone">
                                <i className="fas fa-phone"></i>
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleFavorite(c)}
                              className={c.favorite ? 'fav-active' : ''}
                              title="Favorite"
                            >
                              <i className={`${c.favorite ? 'fas' : 'far'} fa-star`}></i>
                            </button>
                            <button onClick={() => setEditContact(c)} title="Edit Details">
                              <i className="fas fa-pen"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ============ MEDIA GALLERY TAB ============ */}
              {activeTab === 'media' && (() => {
                // Calculate filtered and sorted items dynamically
                let items = mediaItems.filter(item => item.title.toLowerCase().includes(mediaSearchQuery.toLowerCase()));

                if (mediaFilter === 'linked') {
                  items = items.filter(item => !!item.contactId);
                } else if (mediaFilter === 'unlinked') {
                  items = items.filter(item => !item.contactId);
                }

                items.sort((a, b) => {
                  if (mediaSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
                  if (mediaSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
                  if (mediaSort === 'title') return a.title.localeCompare(b.title);
                  if (mediaSort === 'size') {
                    const parseSizeToBytes = (sizeStr) => {
                      if (!sizeStr) return 0;
                      const clean = sizeStr.toLowerCase().trim();
                      const num = parseFloat(clean);
                      if (isNaN(num)) return 0;
                      if (clean.includes('gb') || clean.includes('g')) return num * 1024 * 1024 * 1024;
                      if (clean.includes('mb') || clean.includes('m')) return num * 1024 * 1024;
                      if (clean.includes('kb') || clean.includes('k')) return num * 1024;
                      return num;
                    };
                    return parseSizeToBytes(b.fileSize) - parseSizeToBytes(a.fileSize);
                  }
                  return 0;
                });

                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                      <p style={{ color: 'var(--text2)', fontSize: '14px', margin: 0 }}>Browse, search, and manage all uploaded business card scans and media assets.</p>
                      <button className="btn-sm" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })} aria-label="Upload new media">
                        <i className="fas fa-plus"></i> Upload New Media
                      </button>
                    </div>

                    {/* Media Controls Toolbar */}
                    <div className="media-toolbar" style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px',
                      alignItems: 'center',
                      marginBottom: '20px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)', whiteSpace: 'nowrap' }}>Search:</label>
                        <div className="input-wrap" style={{ margin: 0, width: '100%', position: 'relative' }}>
                          <i className="fas fa-search field-icon" style={{ left: '12px', position: 'absolute', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}></i>
                          <input
                            type="text"
                            placeholder="Search media files..."
                            value={mediaSearchQuery}
                            onChange={(e) => setMediaSearchQuery(e.target.value)}
                            style={{ paddingLeft: '32px', height: '36px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', outline: 'none' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', flex: '999 1 auto', justifyContent: 'flex-end' }}>
                        {/* Link Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)' }}>Filter:</label>
                          <select
                            value={mediaFilter}
                            onChange={(e) => setMediaFilter(e.target.value)}
                            style={{ height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: '#fff', cursor: 'pointer', outline: 'none' }}
                          >
                            <option value="all">All Assets</option>
                            <option value="linked">Linked Only</option>
                            <option value="unlinked">Unlinked Only</option>
                          </select>
                        </div>

                        {/* Sort Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)' }}>Sort:</label>
                          <select
                            value={mediaSort}
                            onChange={(e) => setMediaSort(e.target.value)}
                            style={{ height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', background: '#fff', cursor: 'pointer', outline: 'none' }}
                          >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="title">Name (A-Z)</option>
                            <option value="size">File Size</option>
                          </select>
                        </div>

                        {/* Layout Density */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)' }}>View:</label>
                          <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => setMediaDensity('standard')}
                              style={{
                                border: 'none',
                                background: mediaDensity === 'standard' ? '#fff' : 'transparent',
                                color: mediaDensity === 'standard' ? 'var(--red)' : '#64748b',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: mediaDensity === 'standard' ? '600' : '400'
                              }}
                              title="Standard Grid"
                            >
                              <i className="fas fa-th-large"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => setMediaDensity('compact')}
                              style={{
                                border: 'none',
                                background: mediaDensity === 'compact' ? '#fff' : 'transparent',
                                color: mediaDensity === 'compact' ? 'var(--red)' : '#64748b',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: mediaDensity === 'compact' ? '600' : '400'
                              }}
                              title="Compact Grid"
                            >
                              <i className="fas fa-th"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => setMediaDensity('list')}
                              style={{
                                border: 'none',
                                background: mediaDensity === 'list' ? '#fff' : 'transparent',
                                color: mediaDensity === 'list' ? 'var(--red)' : '#64748b',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: mediaDensity === 'list' ? '600' : '400'
                              }}
                              title="List View"
                            >
                              <i className="fas fa-list"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-icon"><i className="fas fa-images"></i></div>
                        <h2>No media files found</h2>
                        <p>No media files match your filter or search query. Try uploading or changing filters.</p>
                        <button className="btn-primary" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })} style={{ maxWidth: '200px', margin: '0 auto' }}>
                          <i className="fas fa-upload"></i> Upload Media
                        </button>
                      </div>
                    ) : (
                      <div className={`media-grid ${mediaDensity}`}>
                        {items.map(item => (
                          <div key={item._id} className="media-card">
                            <span className={`media-card-badge ${item.contactId ? 'linked' : ''}`}>
                              {item.contactId ? `Linked: ${item.contactId.name || 'Contact'}` : 'Unlinked'}
                            </span>
                            <div className="media-card-img-container" onClick={() => setViewLightbox(item)} style={{ cursor: 'pointer' }}>
                              <img src={item.url} alt={item.title} />
                            </div>
                            <div className="media-card-info">
                              <h3 className="media-card-title" title={item.title}>{item.title}</h3>
                              <div className="media-card-meta">
                                <span>{item.fileSize || 'Unknown Size'}</span>
                                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="media-card-actions">
                                <button className="btn-view" onClick={() => setViewLightbox(item)} title="View Larger" aria-label={`View ${item.title}`}>
                                  <i className="fas fa-search-plus"></i> View
                                </button>
                                <button className="btn-edit" onClick={() => setMediaModal({ id: item._id, title: item.title, url: item.url, contactId: item.contactId?._id || '' })} title="Edit details" aria-label={`Edit media ${item.title}`}>
                                  <i className="fas fa-pen"></i> Edit
                                </button>
                                <button className="btn-delete" onClick={() => handleDeleteMedia(item._id)} title="Delete File" aria-label={`Delete media ${item.title}`}>
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ============ PROJECTS TAB ============ */}
              {activeTab === 'projects' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Create a project or exhibition, scan visitors into it, then export the complete event list.</p>
                    <button className="btn-sm" onClick={() => setProjectModal({ name: '', type: 'exhibition', description: '', eventDate: '', location: '' })} aria-label="Add project or exhibition">
                      <i className="fas fa-plus"></i> New Project / Exhibition
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fas fa-folder-open"></i></div>
                      <h2>No projects or exhibitions yet</h2>
                      <p>Create your first destination before starting a visitor scanning session.</p>
                    </div>
                  ) : (
                    <div className="project-grid">
                      {projects.map(p => (
                        <div key={p._id} className="project-card" style={{ borderColor: 'var(--border)' }} onClick={() => { setSelectedProjectId(p._id); setActiveTab('contacts'); }}>
                          <span className={`project-type-badge ${p.type || 'project'}`}>
                            <i className={`fas ${p.type === 'exhibition' ? 'fa-building-columns' : 'fa-folder'}`}></i>
                            {p.type === 'exhibition' ? 'Exhibition' : 'Project'}
                          </span>
                          <h3>{p.name}</h3>
                          <p>{p.description || 'No description provided'}</p>
                          {(p.eventDate || p.location) && (
                            <div className="project-event-meta">
                              {p.eventDate && <span><i className="fas fa-calendar-day"></i> {new Date(p.eventDate).toLocaleDateString()}</span>}
                              {p.location && <span><i className="fas fa-location-dot"></i> {p.location}</span>}
                            </div>
                          )}
                          <span className="project-count">
                            <i className="fas fa-user-friends"></i> {p.contactCount || 0} Contacts
                          </span>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }} onClick={e => e.stopPropagation()}>
                            <button className="icon-btn project-csv-btn" onClick={() => handleDownloadProjectCSV(p._id)} title={`Export ${p.name} contacts as CSV`} aria-label={`Export ${p.name} as CSV`} style={{ width: '34px', height: '30px', fontSize: '12px' }}>
                              <i className="fas fa-file-csv"></i>
                            </button>
                            <button className="icon-btn" onClick={() => setProjectModal(p)} aria-label={`Edit ${p.name}`} style={{ width: '30px', height: '30px', fontSize: '12px' }}>
                              <i className="fas fa-pen"></i>
                            </button>
                            <button className="icon-btn" onClick={() => handleDeleteProject(p._id)} aria-label={`Delete ${p.name}`} style={{ width: '30px', height: '30px', fontSize: '12px', color: 'var(--red)' }}>
                              <i className="fas fa-trash-can"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ============ SCAN TAB ============ */}
              {activeTab === 'scan' && (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                  {/* Mode Switcher: Rapid (camera + live QR) | Single | Bulk */}
                  <div className="scan-mode-chips">
                    <button
                      type="button"
                      className={scanMode === 'rapid' ? 'active' : ''}
                      onClick={() => { setScanMode('rapid'); setScanPreview(null); startCamera(); }}
                    >
                      <i className="fas fa-bolt"></i> Rapid Scan
                    </button>
                    <button
                      type="button"
                      className={scanMode === 'single' ? 'active' : ''}
                      onClick={() => { setScanMode('single'); stopCamera(); }}
                    >
                      <i className="fas fa-camera"></i> Single
                    </button>
                    <button
                      type="button"
                      className={scanMode === 'bulk' ? 'active' : ''}
                      onClick={() => { setScanMode('bulk'); stopCamera(); }}
                    >
                      <i className="fas fa-images"></i> Bulk Upload
                    </button>
                  </div>

                  {/* Target project — every scan is saved straight to DB + Media */}
                  <section className={`scan-destination-panel ${selectedDestination ? 'selected' : 'required'}`}>
                    <div className="scan-destination-head">
                      <div>
                        <small>Step 1</small>
                        <h2><i className="fas fa-calendar-check"></i> Select Project / Exhibition</h2>
                        <p>Every scanned visitor will be grouped here for one-click CSV export.</p>
                      </div>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setProjectModal({ name: '', type: 'exhibition', description: '', eventDate: '', location: '' })}
                      >
                        <i className="fas fa-plus"></i> New
                      </button>
                    </div>
                    <select
                      aria-label="Select project or exhibition"
                      value={selectedProjectId}
                      onChange={(event) => {
                        setSelectedProjectId(event.target.value);
                        if (event.target.value) setScanFeedback({ phase: 'ready', message: 'Destination selected. Place a QR code or visiting card inside the frame.' });
                      }}
                    >
                      <option value="">Choose a project / exhibition...</option>
                      {projects.map(project => (
                        <option key={project._id} value={project._id}>
                          {project.type === 'exhibition' ? 'Exhibition' : 'Project'} — {project.name}
                        </option>
                      ))}
                    </select>
                    {selectedDestination ? (
                      <div className="selected-destination-summary">
                        <div>
                          <strong><i className={`fas ${selectedDestination.type === 'exhibition' ? 'fa-building-columns' : 'fa-folder'}`}></i> {selectedDestination.name}</strong>
                          <span>{selectedDestination.contactCount || 0} saved contacts{selectedDestination.location ? ` • ${selectedDestination.location}` : ''}</span>
                        </div>
                        <button type="button" className="btn-export-event" onClick={handleDownloadBulkCSV}>
                          <i className="fas fa-file-csv"></i> Export CSV
                        </button>
                      </div>
                    ) : (
                      <div className="destination-required-message">
                        <i className="fas fa-circle-info"></i> Select or create a destination before scanning.
                      </div>
                    )}
                  </section>

                  {renderSessionStats()}

                  {/* Shared hidden multi-file input (Rapid gallery + Bulk upload) */}
                  <input
                    type="file"
                    ref={bulkFileInputRef}
                    multiple
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleBulkFileSelect}
                  />

                  {scanMode === 'rapid' ? (
                    <div className="rapid-scan-area">
                      <div className={`scan-preview rapid ${qrFlash ? 'flash' : ''}`}>
                        {cameraActive ? (
                          <>
                            <video ref={videoRef} autoPlay playsInline muted></video>
                            <div className="scan-frame">
                              <span className="corner tl"></span>
                              <span className="corner tr"></span>
                              <span className="corner bl"></span>
                              <span className="corner br"></span>
                              <div className="scan-line"></div>
                            </div>
                            {(scanFeedback.phase === 'captured' || scanFeedback.phase === 'saved') && (
                              <div className="scan-success-overlay" aria-live="polite">
                                <span className="scan-success-check"><i className="fas fa-check"></i></span>
                                <strong>{scanFeedback.phase === 'captured' ? 'Photo captured' : 'Contact saved'}</strong>
                                <small>{scanFeedback.message}</small>
                              </div>
                            )}
                            <div className="qr-live-pill">
                              <span className="live-dot"></span> QR + Card auto-detect ON
                            </div>
                            <button
                              type="button"
                              className="preview-capture-btn"
                              onClick={() => captureForBackground()}
                              aria-label="Capture card now"
                            >
                              <i className="fas fa-camera"></i>
                              <span>Capture</span>
                            </button>
                          </>
                        ) : (
                          <div className="camera-off-state">
                            <i className={`fas ${cameraStarting ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
                            <p>{cameraStarting ? 'Starting camera automatically. Allow access if prompted...' : scanFeedback.message}</p>
                            {!cameraStarting && scanFeedback.phase === 'error' && (
                              <button className="btn-outline" onClick={startCamera}>
                                <i className="fas fa-rotate-right"></i> Retry camera
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`scan-feedback ${scanFeedback.phase}`} aria-live="polite">
                        <i className={`fas ${scanFeedback.phase === 'saved' || scanFeedback.phase === 'captured' ? 'fa-circle-check' : scanFeedback.phase === 'error' ? 'fa-circle-exclamation' : scanFeedback.phase === 'detecting' ? 'fa-crosshairs' : 'fa-wand-magic-sparkles'}`}></i>
                        <span>{scanFeedback.message}</span>
                      </div>

                      <div className="rapid-controls">
                          <button className="rapid-side-btn" onClick={triggerBulkUpload} title="Pick from gallery">
                            <i className="fas fa-images"></i>
                            <span>Gallery</span>
                          </button>
                          <button className="btn-capture" onClick={() => captureForBackground()} title="Capture manually" disabled={!cameraActive}>
                            <i className="fas fa-camera"></i>
                          </button>
                          <button className="rapid-side-btn" onClick={handleDownloadBulkCSV} title="Download all contacts as CSV">
                            <i className="fas fa-file-csv"></i>
                            <span>CSV</span>
                          </button>
                      </div>

                      <p className="rapid-hint">
                        <i className="fas fa-bolt"></i>
                        Keep one <strong>QR code or visiting card</strong> inside the guide and hold steady. It is captured automatically, saved in the background, and the scanner stays ready for bulk scanning.
                      </p>
                    </div>
                  ) : scanMode === 'single' ? (
                    scanning ? (
                      <div className="extracting-state">
                        <div className="pulse"></div>
                        <h2>Scanning Card...</h2>
                        <p>Checking for a QR code first (free), then reading the card with AI vision — the contact and image are saved to your database automatically.</p>
                      </div>
                    ) : (
                      <div className="scan-area">
                        <div className="scan-preview">
                          {cameraActive ? (
                            <>
                              <video ref={videoRef} autoPlay playsInline muted></video>
                              <div className="scan-frame">
                                <span className="corner tl"></span>
                                <span className="corner tr"></span>
                                <span className="corner bl"></span>
                                <span className="corner br"></span>
                                <div className="scan-line"></div>
                              </div>
                            </>
                          ) : scanPreview ? (
                            <img src={scanPreview} className="preview-img" alt="Captured Card preview" />
                          ) : (
                            <div style={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: '12px' }}>
                              <i className="fas fa-camera" style={{ fontSize: '36px' }}></i>
                              <p style={{ fontSize: '14px' }}>Camera is closed</p>
                            </div>
                          )}
                        </div>

                        <div className="scan-btns">
                          {cameraActive ? (
                            <>
                              <button className="btn-capture" onClick={capturePhoto} title="Capture Image">
                                <i className="fas fa-camera"></i>
                              </button>
                              <button className="btn-gallery" onClick={stopCamera}>
                                Cancel Camera
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn-primary" onClick={startCamera}>
                                <i className="fas fa-video"></i> Start Camera
                              </button>
                              <button className="btn-gallery" onClick={triggerScanUpload}>
                                <i className="fas fa-file-image"></i> Select Photo
                              </button>
                            </>
                          )}
                        </div>

                        {scanPreview && (
                          <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                            <button className="btn-primary" onClick={handleExtractCard} style={{ flex: 1 }}>
                              <i className="fas fa-magic"></i> Extract & Save
                            </button>
                            <button className="btn-outline" onClick={() => setScanPreview(null)} style={{ flex: 1 }}>
                              Discard
                            </button>
                          </div>
                        )}

                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/*"
                          onChange={handleFileSelect}
                        />
                      </div>
                    )
                  ) : (
                    /* Bulk Scan Mode Panel */
                    <div className="bulk-scan-area">
                      <div className="bulk-upload-box" onClick={triggerBulkUpload}>
                        <i className="fas fa-cloud-upload-alt"></i>
                        <h3>Select Card / QR Images</h3>
                        <p>Pick multiple images — they queue up and process automatically in the background. QR codes decode free; printed cards use AI.</p>
                      </div>

                      {bulkQueue.some(item => item.status === 'success') && (
                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(230,50,50,0.05)', borderRadius: '10px', border: '1px solid rgba(230,50,50,0.15)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', textAlign: 'center' }}>
                          <p style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', margin: 0 }}>
                            <i className="fas fa-file-csv"></i> Batch contacts saved to your database & media gallery!
                          </p>
                          <button 
                            onClick={handleDownloadBulkCSV} 
                            className="btn-primary" 
                            style={{ fontSize: '12px', padding: '6px 14px', width: 'auto', background: 'var(--red)' }}
                          >
                            <i className="fas fa-download"></i> Download Project CSV
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {renderQueueTray()}
                </div>
              )}

              {/* ============ PROFILE TAB ============ */}
              {activeTab === 'profile' && (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                  {session && session.user && session.user.role === 'admin' && (
                    <div className="profile-section" style={{ borderLeft: '4px solid var(--red)', background: 'rgba(230, 50, 50, 0.02)', marginBottom: '20px' }}>
                      <h3 style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><i className="fas fa-shield-halved"></i> Admin Console Access</h3>
                      <p style={{ fontSize: '12px', color: 'var(--text2)', margin: '8px 0 12px' }}>You have administrator privileges. Use the button below to manage user accounts and view system settings.</p>
                      <button className="btn-primary" onClick={() => setActiveTab('admin')} style={{ width: '100%', padding: '10px', background: 'var(--red)' }}>
                        <i className="fas fa-cog"></i> Open Admin Console
                      </button>
                    </div>
                  )}
                  <div className="profile-section">
                    <h3><i className="fas fa-id-badge"></i> Profile Details</h3>
                    <div className="avatar-upload">
                      <div className="avatar-large">
                        {session.user.avatar ? <img src={session.user.avatar} alt="Avatar large" /> : getInitials(session.user.name)}
                      </div>
                      <div>
                        <button className="btn-outline" onClick={() => document.getElementById('avatarInput').click()} disabled={profileLoading} style={{ marginBottom: '8px' }}>
                          <i className="fas fa-upload"></i> Upload New Photo
                        </button>
                        <p style={{ fontSize: '12px', color: 'var(--text3)' }}>JPEG, PNG, or GIF. Max 5MB.</p>
                        <input
                          type="file"
                          id="avatarInput"
                          style={{ display: 'none' }}
                          accept="image/*"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                    </div>

                    <form id="profile-form" onSubmit={handleUpdateProfile}>
                      <div className="form-group">
                        <label>Full Name</label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ borderTop: '1px solid var(--border)', margin: '24px 0 16px', paddingTop: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Change Password</h4>
                        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px' }}>Leave blank if you do not want to update password.</p>
                      </div>

                      <div className="form-group">
                        <label>Current Password</label>
                        <div className="input-wrap">
                          <i className="fas fa-lock field-icon"></i>
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            className="pass-toggle"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            tabIndex="-1"
                          >
                            <i className={`fas ${showCurrentPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                        </div>
                      </div>
                      <div className="form-group">
                        <label>New Password</label>
                        <div className="input-wrap">
                          <i className="fas fa-lock field-icon"></i>
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            className="pass-toggle"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            tabIndex="-1"
                          >
                            <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          </button>
                        </div>
                      </div>

                      <button type="submit" className="btn-primary profile-desktop-save" disabled={profileLoading} style={{ marginTop: '12px' }}>
                        {profileLoading ? <span className="spinner"></span> : 'Save Profile Changes'}
                      </button>
                    </form>
                  </div>
                  <button type="submit" form="profile-form" className="btn-primary profile-mobile-save" disabled={profileLoading}>
                    {profileLoading ? <span className="spinner"></span> : <><i className="fas fa-floppy-disk"></i> Save Profile</>}
                  </button>
                </div>
              )}

              {/* ============ ADMIN TAB ============ */}
              {activeTab === 'admin' && session.user.role === 'admin' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Global administrative tools. Add, edit, or delete platform accounts.</p>
                    <button className="btn-sm" onClick={() => setAdminUserModal({ name: '', email: '', password: '', role: 'user' })}>
                      <i className="fas fa-user-plus"></i> Register User Account
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Role</th>
                          <th>Cards Saved</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u._id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className="user-avatar" style={{ width: '30px', height: '30px', fontSize: '12px' }}>
                                  {u.avatar ? <img src={u.avatar} alt="avatar" /> : getInitials(u.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: '500' }}>{u.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`role-badge ${u.role}`}>
                                {u.role}
                              </span>
                            </td>
                            <td>{u.contactCount || 0} cards</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button className="icon-btn" onClick={() => setAdminUserModal(u)} style={{ width: '30px', height: '30px', fontSize: '12px' }}>
                                  <i className="fas fa-user-pen"></i>
                                </button>
                                <button
                                  className="icon-btn"
                                  onClick={() => handleDeleteAdminUser(u._id)}
                                  disabled={u._id === session.user.id}
                                  style={{ width: '30px', height: '30px', fontSize: '12px', color: u._id === session.user.id ? '#cbd5e1' : 'var(--red)', cursor: u._id === session.user.id ? 'not-allowed' : 'pointer' }}
                                >
                                  <i className="fas fa-trash-can"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ============ CONTACT DETAIL MODAL ============ */}
      {viewContact && (
        <div className="modal-overlay" onClick={() => setViewContact(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <button className="modal-back" onClick={() => setViewContact(null)}>
                <i className="fas fa-arrow-left"></i> Back to Contacts
              </button>
              <h2>Contact Details</h2>
            </div>
            <div className="modal-body">
              <div className="detail-header">
                <div className="detail-avatar">{getInitials(viewContact.name)}</div>
                <h2>{viewContact.name}</h2>
                {viewContact.title && <p className="detail-title">{viewContact.title}</p>}
                {viewContact.company && <p className="detail-company">{viewContact.company}</p>}
                {viewContact.scanMethod && viewContact.scanMethod !== 'manual' && (
                  <span className={`scan-method-badge ${viewContact.scanMethod}`}>
                    {viewContact.scanMethod === 'qr' && <><i className="fas fa-qrcode"></i> QR Scan • FREE</>}
                    {viewContact.scanMethod === 'ai' && <><i className="fas fa-wand-magic-sparkles"></i> AI Scan • {formatCost(viewContact.scanCost)}</>}
                    {viewContact.scanMethod === 'import' && <><i className="fas fa-file-import"></i> Imported</>}
                  </span>
                )}
              </div>

              {viewContact.cardImage && (
                <div style={{ marginBottom: '20px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={viewContact.cardImage} alt="Card preview" style={{ width: '100%', display: 'block', maxHeight: '200px', objectFit: 'contain', background: '#f1f5f9' }} />
                </div>
              )}

              {viewContact.phone && (
                <div className="detail-field" onClick={() => window.open(`tel:${viewContact.phone}`)}>
                  <i className="fas fa-phone"></i>
                  <div className="detail-field-info">
                    <small>Phone</small>
                    <p>{viewContact.phone}</p>
                  </div>
                  <i className="fas fa-external-link-alt" style={{ color: 'var(--text3)', fontSize: '11px' }}></i>
                </div>
              )}

              {viewContact.mobile && (
                <div className="detail-field" onClick={() => window.open(`tel:${viewContact.mobile}`)}>
                  <i className="fas fa-mobile-alt"></i>
                  <div className="detail-field-info">
                    <small>Mobile</small>
                    <p>{viewContact.mobile}</p>
                  </div>
                  <i className="fas fa-external-link-alt" style={{ color: 'var(--text3)', fontSize: '11px' }}></i>
                </div>
              )}

              {viewContact.email && (
                <div className="detail-field" onClick={() => window.open(`mailto:${viewContact.email}`)}>
                  <i className="fas fa-envelope"></i>
                  <div className="detail-field-info">
                    <small>Email</small>
                    <p>{viewContact.email}</p>
                  </div>
                  <i className="fas fa-external-link-alt" style={{ color: 'var(--text3)', fontSize: '11px' }}></i>
                </div>
              )}

              {viewContact.website && (
                <div className="detail-field" onClick={() => window.open(viewContact.website.startsWith('http') ? viewContact.website : `https://${viewContact.website}`, '_blank')}>
                  <i className="fas fa-globe"></i>
                  <div className="detail-field-info">
                    <small>Website</small>
                    <p>{viewContact.website}</p>
                  </div>
                  <i className="fas fa-external-link-alt" style={{ color: 'var(--text3)', fontSize: '11px' }}></i>
                </div>
              )}

              {viewContact.address && (
                <div className="detail-field">
                  <i className="fas fa-map-marker-alt"></i>
                  <div className="detail-field-info">
                    <small>Address</small>
                    <p>{viewContact.address}</p>
                  </div>
                </div>
              )}

              {viewContact.notes && (
                <div className="detail-field">
                  <i className="fas fa-sticky-note"></i>
                  <div className="detail-field-info">
                    <small>Notes</small>
                    <p>{viewContact.notes}</p>
                  </div>
                </div>
              )}

              {projects.find(p => p._id === viewContact.projectId) && (
                <div className="detail-field">
                  <i className="fas fa-folder"></i>
                  <div className="detail-field-info">
                    <small>Project / Exhibition</small>
                    <p>{projects.find(p => p._id === viewContact.projectId)?.name}</p>
                  </div>
                </div>
              )}

            </div>
            <div className="modal-footer detail-modal-footer">
              <button
                type="button"
                className={`btn-favorite ${viewContact.favorite ? 'active' : ''}`}
                onClick={() => handleToggleFavorite(viewContact)}
                aria-label={viewContact.favorite ? 'Remove contact from favorites' : 'Add contact to favorites'}
              >
                <i className={`${viewContact.favorite ? 'fas' : 'far'} fa-star`}></i>
                <span>{viewContact.favorite ? 'Saved' : 'Favorite'}</span>
              </button>
              <button type="button" className="btn-outline" onClick={() => { setEditContact(viewContact); setViewContact(null); }} aria-label="Edit contact">
                <i className="fas fa-edit"></i> Edit
              </button>
              <button type="button" className="btn-danger" onClick={() => handleDeleteContact(viewContact._id)} aria-label="Delete contact">
                <i className="fas fa-trash-can"></i> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ CONTACT CREATE/EDIT FORM MODAL ============ */}
      {editContact && (
        <div className="modal-overlay" onClick={() => setEditContact(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editContact._id ? 'Edit Contact' : 'New Business Contact'}</h2>
              <button type="button" className="close-btn" onClick={() => setEditContact(null)} aria-label="Close contact form">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveContact}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={editContact.name}
                    onChange={e => setEditContact({ ...editContact, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Job Title</label>
                  <input
                    type="text"
                    value={editContact.title}
                    onChange={e => setEditContact({ ...editContact, title: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <input
                    type="text"
                    value={editContact.company}
                    onChange={e => setEditContact({ ...editContact, company: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={editContact.phone}
                    onChange={e => setEditContact({ ...editContact, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Mobile</label>
                  <input
                    type="text"
                    value={editContact.mobile}
                    onChange={e => setEditContact({ ...editContact, mobile: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editContact.email}
                    onChange={e => setEditContact({ ...editContact, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input
                    type="text"
                    value={editContact.website}
                    onChange={e => setEditContact({ ...editContact, website: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    value={editContact.address}
                    onChange={e => setEditContact({ ...editContact, address: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Project / Exhibition</label>
                  <select
                    value={editContact.projectId || ''}
                    onChange={e => setEditContact({ ...editContact, projectId: e.target.value || null })}
                  >
                    <option value="">Unorganized</option>
                    {projects.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows="3"
                    value={editContact.notes}
                    onChange={e => setEditContact({ ...editContact, notes: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setEditContact(null)} aria-label="Cancel contact changes">Cancel</button>
                <button type="submit" className="btn-primary">Save Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ PROJECT CREATE/EDIT FORM MODAL ============ */}
      {projectModal && (
        <div className="modal-overlay" onClick={() => setProjectModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{projectModal._id ? 'Edit Project / Exhibition' : 'New Project / Exhibition'}</h2>
              <button type="button" className="close-btn" onClick={() => setProjectModal(null)} aria-label="Close project form">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveProject}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Destination Type</label>
                  <select
                    value={projectModal.type || 'project'}
                    onChange={e => setProjectModal({ ...projectModal, type: e.target.value })}
                  >
                    <option value="project">Project</option>
                    <option value="exhibition">Exhibition / Event</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={projectModal.name}
                    onChange={e => setProjectModal({ ...projectModal, name: e.target.value })}
                    required
                  />
                </div>
                <div className="destination-form-grid">
                  <div className="form-group">
                    <label>Event Date <span>(Optional)</span></label>
                    <input
                      type="date"
                      value={projectModal.eventDate ? String(projectModal.eventDate).slice(0, 10) : ''}
                      onChange={e => setProjectModal({ ...projectModal, eventDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Location <span>(Optional)</span></label>
                    <input
                      type="text"
                      value={projectModal.location || ''}
                      placeholder="Venue or city"
                      onChange={e => setProjectModal({ ...projectModal, location: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    rows="3"
                    value={projectModal.description}
                    onChange={e => setProjectModal({ ...projectModal, description: e.target.value })}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setProjectModal(null)} aria-label="Cancel project changes">Cancel</button>
                <button type="submit" className="btn-primary">Save & Select</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ ADMIN USER FORM MODAL ============ */}
      {adminUserModal && (
        <div className="modal-overlay" onClick={() => setAdminUserModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{adminUserModal._id ? 'Edit User Details' : 'Register Platform Account'}</h2>
              <button className="close-btn" onClick={() => setAdminUserModal(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveAdminUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={adminUserModal.name}
                    onChange={e => setAdminUserModal({ ...adminUserModal, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={adminUserModal.email}
                    onChange={e => setAdminUserModal({ ...adminUserModal, email: e.target.value })}
                    required
                  />
                </div>
                 <div className="form-group">
                  <label>Password {adminUserModal._id && '(Leave blank to keep unchanged)'}</label>
                  <div className="input-wrap">
                    <i className="fas fa-lock field-icon"></i>
                    <input
                      type={showAdminUserPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={adminUserModal.password || ''}
                      onChange={e => setAdminUserModal({ ...adminUserModal, password: e.target.value })}
                      required={!adminUserModal._id}
                      style={{ paddingLeft: '40px', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      className="pass-toggle"
                      onClick={() => setShowAdminUserPassword(!showAdminUserPassword)}
                      tabIndex="-1"
                    >
                      <i className={`fas ${showAdminUserPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>System Role</label>
                  <select
                    value={adminUserModal.role}
                    onChange={e => setAdminUserModal({ ...adminUserModal, role: e.target.value })}
                  >
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setAdminUserModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ DATA TOOLS IMPORT/EXPORT MODAL ============ */}
      {toolsModalOpen && (
        <div className="modal-overlay" onClick={() => setToolsModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-head">
              <h2>Data Management Tools</h2>
              <button type="button" className="close-btn" onClick={() => setToolsModalOpen(false)} aria-label="Close import and export tools">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text2)', textTransform: 'uppercase', marginBottom: '12px' }}>Export Contacts Data</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                <button className="btn-outline" onClick={() => handleExport('csv')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-file-csv" style={{ color: 'var(--red)', width: '20px' }}></i> Export as CSV Excel Format
                </button>
                <button className="btn-outline" onClick={() => handleExport('vcf')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-address-card" style={{ color: 'var(--red)', width: '20px' }}></i> Export as Apple/Outlook vCard (.vcf)
                </button>
                <button className="btn-outline" onClick={() => handleExport('json')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-file-code" style={{ color: 'var(--red)', width: '20px' }}></i> Export as RAW JSON Backup
                </button>
              </div>

              <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text2)', textTransform: 'uppercase', marginBottom: '12px' }}>Import Contacts Data</h4>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Select format, match columns (Name, Email, Phone, Company, Notes, etc.), then import.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button className="btn-outline" onClick={() => triggerImportClick('.csv')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-file-csv" style={{ color: 'var(--red)', width: '20px' }}></i> Import CSV spreadsheet
                </button>
                <button className="btn-outline" onClick={() => triggerImportClick('.vcf')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-address-card" style={{ color: 'var(--red)', width: '20px' }}></i> Import Apple/Outlook vCard
                </button>
                <button className="btn-outline" onClick={() => triggerImportClick('.json')} style={{ justifyContent: 'flex-start' }}>
                  <i className="fas fa-file-code" style={{ color: 'var(--red)', width: '20px' }}></i> Restore JSON backup file
                </button>
              </div>

              <input
                type="file"
                ref={importFileInputRef}
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        <button className={`mobile-nav-item ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => openContacts(false)} aria-label="Contacts">
          <i className="fas fa-address-book"></i>
          <span>Contacts</span>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => openNavigationTab('projects')} aria-label="Projects and exhibitions">
          <i className="fas fa-calendar-days"></i>
          <span>Events</span>
        </button>
        <button className={`mobile-nav-item scan-btn ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => openNavigationTab('scan')} aria-label="Open automatic scanner">
          <div className="scan-btn-inner">
            <i className="fas fa-camera"></i>
          </div>
          <span className="scan-nav-label">Scan</span>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'media' ? 'active' : ''}`} onClick={() => openNavigationTab('media')} aria-label="Media gallery">
          <i className="fas fa-photo-film"></i>
          <span>Media</span>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => openNavigationTab('profile')} aria-label="Profile">
          <i className="fas fa-user-gear"></i>
          <span>Profile</span>
        </button>
      </nav>

      {/* ============ MEDIA CREATE/EDIT MODAL ============ */}
      {mediaModal && (
        <div className="modal-overlay" onClick={() => setMediaModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <h2>{mediaModal.id ? 'Edit Media Details' : 'Upload New Media'}</h2>
              <button type="button" className="close-btn" onClick={() => setMediaModal(null)} aria-label="Close media form">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveMedia}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Media Title</label>
                  <input
                    type="text"
                    required
                    value={mediaModal.title}
                    onChange={e => setMediaModal({ ...mediaModal, title: e.target.value })}
                    placeholder="e.g. Acme Corp Business Card"
                  />
                </div>

                <div className="form-group">
                  <label>File Upload</label>
                  {mediaModal.base64Data || mediaModal.url ? (
                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                      <img
                        src={mediaModal.base64Data || mediaModal.url}
                        alt="Preview"
                        style={{ width: '100%', height: '180px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eef2f6', background: '#f8f9fb' }}
                      />
                      <button
                        type="button"
                        className="btn-sm"
                        style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none' }}
                        onClick={() => document.getElementById('mediaModalFileInput').click()}
                      >
                        <i className="fas fa-camera" style={{ marginRight: '4px' }}></i> Replace Image
                      </button>
                    </div>
                  ) : (
                    <div
                      className="file-dropzone"
                      onClick={() => document.getElementById('mediaModalFileInput').click()}
                      style={{ border: '2px dashed #e2e8f0', borderRadius: '12px', padding: '32px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}
                    >
                      <i className="fas fa-cloud-upload-alt" style={{ fontSize: '32px', color: 'var(--red)', marginBottom: '8px' }}></i>
                      <p style={{ margin: 0, fontWeight: 500 }}>Click to upload an image</p>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>PNG, JPG or WEBP formats</p>
                    </div>
                  )}
                  <input
                    type="file"
                    id="mediaModalFileInput"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setMediaModal({
                            ...mediaModal,
                            title: mediaModal.title || file.name.substring(0, file.name.lastIndexOf('.')),
                            base64Data: reader.result
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Link to Contact (Optional)</label>
                  <select
                    value={mediaModal.contactId || ''}
                    onChange={e => setMediaModal({ ...mediaModal, contactId: e.target.value })}
                  >
                    <option value="">-- No Linked Contact --</option>
                    {contacts.map(c => (
                      <option key={c._id} value={c._id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setMediaModal(null)} aria-label="Cancel media changes">Cancel</button>
                <button type="submit" className="btn-primary" disabled={mediaLoading} aria-label={mediaModal.id ? 'Save media changes' : 'Upload media'}>
                  {mediaLoading ? (
                    <div className="spinner" style={{ width: '18px', height: '18px', borderTopColor: 'transparent', borderColor: '#fff' }}></div>
                  ) : (
                    mediaModal.id ? 'Save Changes' : 'Upload'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ LIGHTBOX PREVIEW ============ */}
      {viewLightbox && (
        <div className="lightbox-overlay" onClick={() => setViewLightbox(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button type="button" className="lightbox-close" onClick={() => setViewLightbox(null)} aria-label="Close media preview">
              <i className="fas fa-times"></i>
            </button>
            <img src={viewLightbox.url} alt={viewLightbox.title} className="lightbox-img" />
            <div className="lightbox-title">{viewLightbox.title}</div>
          </div>
        </div>
      )}

      {/* Invisible Canvas for camera snapshots */}
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
    </div>
  );
}
