'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';

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
  const [scanPreview, setScanPreview] = useState(null); // base64 string
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);
  const bulkFileInputRef = useRef(null);

  // Profile Edit State
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [scanMode, setScanMode] = useState('single'); // single | bulk
  const [bulkQueue, setBulkQueue] = useState([]); // { id, name, preview, status, progress, parsedData, error }
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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
      setProfileName(session.user.name || '');
      setProfileEmail(session.user.email || '');
      Promise.all([fetchContacts(), fetchProjects(), fetchUsers(), fetchMedia()]).finally(() => {
        setLoading(false);
      });
    }
  }, [session, searchQuery, selectedProjectId, filterFavorite, activeTab]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  // ---------------- AUTH CHECK ----------------
  if (!session) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8f9fb' }}>
        <div className="spinner" style={{ borderColor: 'var(--red)', borderTopColor: 'transparent', width: '40px', height: '40px' }}></div>
      </div>
    );
  }

  // ---------------- CAMERA HANDLERS ----------------
  const startCamera = async () => {
    setCameraActive(true);
    setScanPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access denied:', err);
      showToast('Camera access denied. Please upload a photo instead.', 'error');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    setScanPreview(base64);
    stopCamera();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setScanPreview(event.target.result);
      stopCamera();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const triggerScanUpload = () => {
    fileInputRef.current?.click();
  };

  const triggerBulkUpload = () => {
    bulkFileInputRef.current?.click();
  };

  const handleBulkFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newQueueItems = [];
    let loadedCount = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        newQueueItems.push({
          id: Math.random().toString(36).substring(2, 9),
          name: file.name,
          preview: event.target.result,
          status: 'queued', // queued | scanning | saving | success | failed
          progress: 0,
          parsedData: null,
          error: null
        });

        loadedCount++;
        if (loadedCount === files.length) {
          setBulkQueue((prev) => [...prev, ...newQueueItems]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleProcessBulkQueue = async () => {
    if (isBulkProcessing || bulkQueue.length === 0) return;
    setIsBulkProcessing(true);

    const items = [...bulkQueue];

    for (let i = 0; i < items.length; i++) {
      if (items[i].status !== 'queued' && items[i].status !== 'failed') continue;

      // Mark as scanning
      items[i].status = 'scanning';
      setBulkQueue([...items]);

      try {
        // 1. Scan image with AI
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: items[i].preview })
        });
        const scanData = await scanRes.json();
        if (!scanRes.ok) throw new Error(scanData.error || 'AI analysis failed');

        // 2. Mark as saving
        items[i].status = 'saving';
        setBulkQueue([...items]);

        // 3. Save to Database
        const contactPayload = {
          name: scanData.name || 'Unnamed Contact',
          title: scanData.title || '',
          company: scanData.company || '',
          phone: scanData.phone || '',
          mobile: scanData.mobile || '',
          email: scanData.email || '',
          website: scanData.website || '',
          address: scanData.address || '',
          cardImage: scanData.cardImage || '',
          cardImagePublicId: scanData.cardImagePublicId || '',
          projectId: selectedProjectId || '',
          notes: 'Auto-imported via Bulk Scan'
        };

        const saveRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactPayload)
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save contact');

        // 4. Success!
        items[i].status = 'success';
        items[i].parsedData = contactPayload;
        setBulkQueue([...items]);
      } catch (err) {
        items[i].status = 'failed';
        items[i].error = err.message;
        setBulkQueue([...items]);
      }
    }

    setIsBulkProcessing(false);
    fetchContacts(); // Refresh contact list
    showToast('Bulk processing complete!', 'success');
  };

  const handleDownloadBulkCSV = () => {
    let url = '/api/export?format=csv';
    if (selectedProjectId) {
      url += `&projectId=${selectedProjectId}`;
    }
    window.open(url, '_blank');
  };

  const handleExtractCard = async () => {
    if (!scanPreview) return;
    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: scanPreview })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract card details');

      // Card successfully extracted. Switch view to "New Contact" modal
      setScanning(false);
      setScanPreview(null);
      setEditContact({
        name: data.name || '',
        title: data.title || '',
        company: data.company || '',
        phone: data.phone || '',
        mobile: data.mobile || '',
        email: data.email || '',
        website: data.website || '',
        address: data.address || '',
        cardImage: data.cardImage || '',
        cardImagePublicId: data.cardImagePublicId || '',
        projectId: selectedProjectId || '',
        notes: ''
      });
      showToast('Card parsed successfully!', 'success');
    } catch (err) {
      setScanning(false);
      showToast(err.message, 'error');
    }
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

      showToast(isNew ? 'Project created!' : 'Project updated!', 'success');
      setProjectModal(null);
      fetchProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteProject = async (id) => {
    if (!confirm('Delete this project folder? Contacts inside will not be deleted, they will be set to unorganized.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Project deleted', 'success');
        setProjectModal(null);
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

  return (
    <div className="dashboard">
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src="/assets/logo-full.png" alt="OnePWS logo" />
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => { setActiveTab('contacts'); setMobileMenuOpen(false); }}>
            <i className="fas fa-address-book"></i>
            <span>Contacts</span>
            <span className="badge">{contacts.length}</span>
          </button>
          <button className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => { setActiveTab('projects'); setMobileMenuOpen(false); }}>
            <i className="fas fa-folder"></i>
            <span>Projects</span>
            <span className="badge">{projects.length}</span>
          </button>
          <button className={`nav-item ${activeTab === 'media' ? 'active' : ''}`} onClick={() => { setActiveTab('media'); setMobileMenuOpen(false); }}>
            <i className="fas fa-images"></i>
            <span>Media Gallery</span>
            <span className="badge">{mediaItems.length}</span>
          </button>
          <button className={`nav-item ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => { setActiveTab('scan'); setMobileMenuOpen(false); startCamera(); }}>
            <i className="fas fa-expand"></i>
            <span>Scan Business Card</span>
          </button>

          <div className="nav-section">Account</div>
          <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}>
            <i className="fas fa-user-circle"></i>
            <span>My Profile</span>
          </button>

          {session.user.role === 'admin' && (
            <>
              <div className="nav-section">Admin Access</div>
              <button className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }}>
                <i className="fas fa-shield-halved"></i>
                <span>User Management</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info" onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}>
            <div className="user-avatar">
              {session.user.avatar ? <img src={session.user.avatar} alt="avatar" /> : getInitials(session.user.name)}
            </div>
            <div className="user-details">
              <h4>{session.user.name}</h4>
              <p>{session.user.role === 'admin' ? 'Administrator' : 'Standard User'}</p>
            </div>
          </div>
          <button className="nav-item" onClick={() => signOut({ callbackUrl: '/login' })} style={{ color: 'var(--red)', marginTop: '8px' }}>
            <i className="fas fa-sign-out-alt"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-brand-mobile">
            <img src="/assets/logo-icon.png" alt="OnePWS logo" className="mobile-logo-icon" />
          </div>

          <h1>
            {activeTab === 'contacts' && 'My Contacts'}
            {activeTab === 'projects' && 'Project Folders'}
            {activeTab === 'media' && 'Media Gallery'}
            {activeTab === 'scan' && 'Scan Card'}
            {activeTab === 'profile' && 'My Profile'}
            {activeTab === 'admin' && 'Admin Console'}
          </h1>

          <div className="top-header-actions">
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
                <button className="icon-btn" onClick={() => setFilterFavorite(!filterFavorite)} title="Filter Favorites" style={{ borderColor: filterFavorite ? 'var(--red)' : '', color: filterFavorite ? 'var(--red)' : '' }}>
                  <i className="fas fa-star"></i>
                </button>
                <button className="icon-btn" onClick={() => setToolsModalOpen(true)} title="Import / Export Data">
                  <i className="fas fa-file-import"></i>
                </button>
                <button className="btn-sm btn-quick-scan" onClick={() => { setActiveTab('scan'); startCamera(); }}>
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
                <button className="btn-sm" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })}>
                  <i className="fas fa-upload"></i>
                  <span>Upload Media</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content">
          {loading ? (
            <div style={{ display: 'flex', flex: 1, height: '60vh', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" style={{ borderColor: 'var(--red)', borderTopColor: 'transparent', width: '32px', height: '32px' }}></div>
            </div>
          ) : (
            <>
              {/* ============ CONTACTS TAB ============ */}
              {activeTab === 'contacts' && (
                <div>
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
                      <button className="btn-primary" onClick={() => { setActiveTab('scan'); startCamera(); }} style={{ maxWidth: '200px', margin: '0 auto' }}>
                        <i className="fas fa-camera"></i> Scan Card Now
                      </button>
                    </div>
                  ) : (
                    <div className="contact-grid">
                      {contacts.map(c => (
                        <div key={c._id} className="contact-row" onClick={() => setViewContact(c)}>
                          <div className="contact-avatar">{getInitials(c.name)}</div>
                          <div className="contact-details">
                            <h3>{c.name}</h3>
                            {c.company && <p className="company">{c.company}</p>}
                            <p className="meta">{c.title ? `${c.title} • ` : ''}{c.email || c.phone || 'No contact details'}</p>
                          </div>
                          <div className="contact-actions" onClick={e => e.stopPropagation()}>
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
              {activeTab === 'media' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Browse, search, and manage all uploaded business card scans and media assets.</p>
                    <button className="btn-sm" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })}>
                      <i className="fas fa-plus"></i> Upload New Media
                    </button>
                  </div>

                  {mediaItems.filter(item => item.title.toLowerCase().includes(mediaSearchQuery.toLowerCase())).length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fas fa-images"></i></div>
                      <h2>No media files found</h2>
                      <p>Upload a new image file or scan a business card to populate the media library.</p>
                      <button className="btn-primary" onClick={() => setMediaModal({ title: '', base64Data: '', contactId: '' })} style={{ maxWidth: '200px', margin: '0 auto' }}>
                        <i className="fas fa-upload"></i> Upload Media
                      </button>
                    </div>
                  ) : (
                    <div className="media-grid">
                      {mediaItems
                        .filter(item => item.title.toLowerCase().includes(mediaSearchQuery.toLowerCase()))
                        .map(item => (
                          <div key={item._id} className="media-card">
                            <span className={`media-card-badge ${item.contactId ? 'linked' : ''}`}>
                              {item.contactId ? `Linked: ${item.contactId.name || 'Contact'}` : 'Unlinked'}
                            </span>
                            <div className="media-card-img-container" onClick={() => setViewLightbox(item)} style={{ cursor: 'pointer' }}>
                              <img src={item.url} alt={item.title} />
                            </div>
                            <div className="media-card-info">
                              <h3 className="media-card-title">{item.title}</h3>
                              <div className="media-card-meta">
                                <span>{item.fileSize || 'Unknown Size'}</span>
                                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="media-card-actions">
                                <button className="btn-view" onClick={() => setViewLightbox(item)} title="View Larger">
                                  <i className="fas fa-search-plus"></i> View
                                </button>
                                <button className="btn-edit" onClick={() => setMediaModal({ id: item._id, title: item.title, url: item.url, contactId: item.contactId?._id || '' })} title="Edit details">
                                  <i className="fas fa-pen"></i> Edit
                                </button>
                                <button className="btn-delete" onClick={() => handleDeleteMedia(item._id)} title="Delete File">
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ============ PROJECTS TAB ============ */}
              {activeTab === 'projects' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <p style={{ color: 'var(--text2)', fontSize: '14px' }}>Organize contacts into custom folders and client lists.</p>
                    <button className="btn-sm" onClick={() => setProjectModal({ name: '', description: '' })}>
                      <i className="fas fa-plus"></i> New Project Folder
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><i className="fas fa-folder-open"></i></div>
                      <h2>No folders created yet</h2>
                      <p>Create a project directory to categorize business cards per business case or company.</p>
                    </div>
                  ) : (
                    <div className="project-grid">
                      {projects.map(p => (
                        <div key={p._id} className="project-card" style={{ borderColor: 'var(--border)' }} onClick={() => { setSelectedProjectId(p._id); setActiveTab('contacts'); }}>
                          <h3>{p.name}</h3>
                          <p>{p.description || 'No description provided'}</p>
                          <span className="project-count">
                            <i className="fas fa-user-friends"></i> {p.contactCount || 0} Contacts
                          </span>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }} onClick={e => e.stopPropagation()}>
                            <button className="icon-btn" onClick={() => setProjectModal(p)} style={{ width: '30px', height: '30px', fontSize: '12px' }}>
                              <i className="fas fa-pen"></i>
                            </button>
                            <button className="icon-btn" onClick={() => handleDeleteProject(p._id)} style={{ width: '30px', height: '30px', fontSize: '12px', color: 'var(--red)' }}>
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
                  {/* Segment Switcher */}
                  <div className="tab-segment" style={{ display: 'flex', borderRadius: '12px', background: '#f1f3f5', padding: '4px', marginBottom: '20px' }}>
                    <button 
                      type="button" 
                      className={`segment-btn ${scanMode === 'single' ? 'active' : ''}`}
                      onClick={() => setScanMode('single')}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: scanMode === 'single' ? '#fff' : 'transparent', fontWeight: '600', fontSize: '13px', color: scanMode === 'single' ? 'var(--red)' : 'var(--text2)', cursor: 'pointer', transition: 'var(--transition)' }}
                    >
                      <i className="fas fa-camera" style={{ marginRight: '6px' }}></i> Single Scan
                    </button>
                    <button 
                      type="button" 
                      className={`segment-btn ${scanMode === 'bulk' ? 'active' : ''}`}
                      onClick={() => { setScanMode('bulk'); stopCamera(); }}
                      style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: scanMode === 'bulk' ? '#fff' : 'transparent', fontWeight: '600', fontSize: '13px', color: scanMode === 'bulk' ? 'var(--red)' : 'var(--text2)', cursor: 'pointer', transition: 'var(--transition)' }}
                    >
                      <i className="fas fa-images" style={{ marginRight: '6px' }}></i> Bulk Upload
                    </button>
                  </div>

                  {scanMode === 'single' ? (
                    scanning ? (
                      <div className="extracting-state">
                        <div className="pulse"></div>
                        <h2>Analyzing Business Card...</h2>
                        <p>OpenAI GPT-4o Vision model is reading the text, detecting fields, and extracting information details...</p>
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
                              <i className="fas fa-magic"></i> Extract Card Details
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
                    <div className="bulk-scan-area" style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px' }}>
                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)', display: 'block', marginBottom: '6px' }}>Target Project for Scans</label>
                        <select 
                          value={selectedProjectId} 
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none' }}
                        >
                          <option value="">Personal Contacts (No Project)</option>
                          {projects.map(p => (
                            <option key={p._id} value={p._id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="bulk-upload-box" onClick={triggerBulkUpload} style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '30px 16px', textAlign: 'center', cursor: 'pointer', background: '#fafafa', transition: 'var(--transition)', marginBottom: '20px' }}>
                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '40px', color: 'var(--red)', marginBottom: '10px' }}></i>
                        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>Select Business Card Images</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Select multiple images to batch process with AI</p>
                        <input 
                          type="file" 
                          ref={bulkFileInputRef} 
                          multiple 
                          style={{ display: 'none' }} 
                          accept="image/*" 
                          onChange={handleBulkFileSelect} 
                        />
                      </div>

                      {bulkQueue.length > 0 && (
                        <>
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <button 
                              className="btn-primary" 
                              onClick={handleProcessBulkQueue} 
                              disabled={isBulkProcessing}
                              style={{ flex: 2 }}
                            >
                              {isBulkProcessing ? (
                                <>
                                  <span className="spinner" style={{ marginRight: '8px' }}></span>
                                  Processing ({bulkQueue.filter(q => q.status === 'scanning' || q.status === 'saving').length + 1}/{bulkQueue.length})...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-play" style={{ marginRight: '8px' }}></i> Start Bulk AI Scan ({bulkQueue.filter(q => q.status === 'queued' || q.status === 'failed').length} left)
                                </>
                              )}
                            </button>
                            <button 
                              className="btn-outline" 
                              onClick={() => setBulkQueue([])} 
                              disabled={isBulkProcessing}
                              style={{ flex: 1 }}
                            >
                              <i className="fas fa-trash-can"></i> Clear
                            </button>
                          </div>

                          <div className="bulk-queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                            {bulkQueue.map((item) => (
                              <div key={item.id} className="bulk-queue-card" style={{ background: '#fcfcfc', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <img src={item.preview} style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)' }} alt="Preview" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h4>
                                  {item.status === 'queued' && <span style={{ fontSize: '11px', color: 'var(--text3)' }}><i className="fas fa-clock"></i> Queued</span>}
                                  {item.status === 'scanning' && <span style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '500' }}><i className="fas fa-spinner fa-spin"></i> Analyzing (AI)...</span>}
                                  {item.status === 'saving' && <span style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '500' }}><i className="fas fa-spinner fa-spin"></i> Saving...</span>}
                                  {item.status === 'success' && (
                                    <div>
                                      <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', display: 'block' }}>
                                        <i className="fas fa-check-circle"></i> Saved successfully
                                      </span>
                                      {item.parsedData && (
                                        <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          <strong>{item.parsedData.name}</strong> • {item.parsedData.title} at {item.parsedData.company}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {item.status === 'failed' && <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500' }}><i className="fas fa-exclamation-circle"></i> Error: {item.error}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {bulkQueue.some(item => item.status === 'success') && (
                        <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(230,50,50,0.05)', borderRadius: '10px', border: '1px solid rgba(230,50,50,0.15)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', textAlign: 'center' }}>
                          <p style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', margin: 0 }}>
                            <i className="fas fa-file-csv"></i> batch contacts saved dynamically in database!
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
                </div>
              )}

              {/* ============ PROFILE TAB ============ */}
              {activeTab === 'profile' && (
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
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

                    <form onSubmit={handleUpdateProfile}>
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

                      <button type="submit" className="btn-primary" disabled={profileLoading} style={{ marginTop: '12px' }}>
                        {profileLoading ? <span className="spinner"></span> : 'Save Profile Changes'}
                      </button>
                    </form>
                  </div>
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
              <h2>Contact Details</h2>
              <button className="close-btn" onClick={() => setViewContact(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-header">
                <div className="detail-avatar">{getInitials(viewContact.name)}</div>
                <h2>{viewContact.name}</h2>
                {viewContact.title && <p className="detail-title">{viewContact.title}</p>}
                {viewContact.company && <p className="detail-company">{viewContact.company}</p>}
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
                    <small>Project Folder</small>
                    <p>{projects.find(p => p._id === viewContact.projectId)?.name}</p>
                  </div>
                </div>
              )}

              <div className="detail-actions">
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setEditContact(viewContact); setViewContact(null); }}>
                  <i className="fas fa-edit"></i> Edit
                </button>
                <button className="btn-danger" style={{ flex: 1 }} onClick={() => handleDeleteContact(viewContact._id)}>
                  <i className="fas fa-trash-can"></i> Delete
                </button>
              </div>
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
              <button className="close-btn" onClick={() => setEditContact(null)}>
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
                  <label>Project Folder</label>
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
                <button type="button" className="btn-outline" onClick={() => setEditContact(null)}>Cancel</button>
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
              <h2>{projectModal._id ? 'Edit Folder' : 'New Project Folder'}</h2>
              <button className="close-btn" onClick={() => setProjectModal(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSaveProject}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Folder Name</label>
                  <input
                    type="text"
                    value={projectModal.name}
                    onChange={e => setProjectModal({ ...projectModal, name: e.target.value })}
                    required
                  />
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
                <button type="button" className="btn-outline" onClick={() => setProjectModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Folder</button>
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
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={adminUserModal.password || ''}
                    onChange={e => setAdminUserModal({ ...adminUserModal, password: e.target.value })}
                    required={!adminUserModal._id}
                  />
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
              <button className="close-btn" onClick={() => setToolsModalOpen(false)}>
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
      <nav className="mobile-bottom-nav">
        <button className={`mobile-nav-item ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveTab('contacts')}>
          <i className="fas fa-address-book"></i>
          <span>Contacts</span>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>
          <i className="fas fa-folder"></i>
          <span>Projects</span>
        </button>
        <button className={`mobile-nav-item scan-btn ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => { setActiveTab('scan'); startCamera(); }}>
          <div className="scan-btn-inner">
            <i className="fas fa-camera"></i>
          </div>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>
          <i className="fas fa-images"></i>
          <span>Media</span>
        </button>
        <button className={`mobile-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <i className="fas fa-user-circle"></i>
          <span>Profile</span>
        </button>
        {session && session.user && session.user.role === 'admin' && (
          <button className={`mobile-nav-item ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>
            <i className="fas fa-shield-halved"></i>
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* ============ MEDIA CREATE/EDIT MODAL ============ */}
      {mediaModal && (
        <div className="modal-overlay" onClick={() => setMediaModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <h2>{mediaModal.id ? 'Edit Media Details' : 'Upload New Media'}</h2>
              <button className="close-btn" onClick={() => setMediaModal(null)}>
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
                <button type="button" className="btn-outline" onClick={() => setMediaModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={mediaLoading}>
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
            <button className="lightbox-close" onClick={() => setViewLightbox(null)}>
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
