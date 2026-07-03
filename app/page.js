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
  const [loading, setLoading] = useState(true);

  // Filter state
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [filterFavorite, setFilterFavorite] = useState(false);

  // Modals state
  const [viewContact, setViewContact] = useState(null);
  const [editContact, setEditContact] = useState(null); // object to edit or empty object to create
  const [projectModal, setProjectModal] = useState(null); // object to edit or empty object to create
  const [adminUserModal, setAdminUserModal] = useState(null); // user to edit/create
  const [toolsModalOpen, setToolsModalOpen] = useState(false);

  // Camera & Scanner State
  const [cameraActive, setCameraActive] = useState(false);
  const [scanPreview, setScanPreview] = useState(null); // base64 string
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  // Profile Edit State
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

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

  useEffect(() => {
    if (session) {
      setProfileName(session.user.name || '');
      setProfileEmail(session.user.email || '');
      Promise.all([fetchContacts(), fetchProjects(), fetchUsers()]).finally(() => {
        setLoading(false);
      });
    }
  }, [session, searchQuery, selectedProjectId, filterFavorite]);

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
          <button className="mobile-toggle" onClick={() => setMobileMenuOpen(true)}>
            <i className="fas fa-bars"></i>
          </button>

          <h1>
            {activeTab === 'contacts' && 'My Contacts'}
            {activeTab === 'projects' && 'Project Folders'}
            {activeTab === 'scan' && 'Scan Business Card'}
            {activeTab === 'profile' && 'Profile Management'}
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
                <button className="btn-sm" onClick={() => { setActiveTab('scan'); startCamera(); }}>
                  <i className="fas fa-camera"></i>
                  <span>Quick Scan</span>
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
                  {scanning ? (
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
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>New Password</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
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

      {/* Invisible Canvas for camera snapshots */}
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
    </div>
  );
}
