// Enhanced Cotton Tracker with Fixed Marathi PDF Support
class CottonTracker {
    constructor() {
        this.db = null;
        this.currentSession = [];
        this.history = [];
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
        this.confirmCallback = null;
        this.activeTab = 'today';

        this.init();
    }

    async init() {
        try {
            await this.initDB();
            this.setupEventListeners();
            this.setDefaultDate();
            await this.loadCurrentSession();
            await this.loadHistory();
            this.showToast('Cotton Tracker ready!', 'success');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Failed to initialize app', 'error');
        }
    }

    // Enhanced IndexedDB Setup
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CottonTrackerDB', 2);

            request.onerror = () => {
                console.error('Database initialization failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Current Session Store
                if (!db.objectStoreNames.contains('currentSession')) {
                    const currentStore = db.createObjectStore('currentSession', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    currentStore.createIndex('date', 'date', { unique: false });
                    currentStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // History Store
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'date' });
                    historyStore.createIndex('date', 'date', { unique: true });
                }
            };
        });
    }

    // Utility Functions
    formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    }

    formatDateDisplay(dateString) {
        const date = this.parseDate(dateString);
        return date.toLocaleDateString('en-IN', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    parseDate(dateString) {
        const [day, month, year] = dateString.split('-');
        return new Date(year, month - 1, day);
    }

    setDefaultDate() {
        const today = new Date();
        const dateInput = document.getElementById('work-date');
        if (dateInput) {
            dateInput.value = today.toISOString().split('T')[0];
        }
    }

    evaluateExpression(expression) {
        try {
            const cleaned = expression.replace(/\s/g, '');

            if (!/^[\d+\-*/().]+$/.test(cleaned)) {
                throw new Error('केवल संख्या और +, -, *, /, () का उपयोग करें');
            }

            const result = Function('"use strict"; return (' + cleaned + ')')();

            if (isNaN(result) || !isFinite(result) || result < 0) {
                throw new Error('गलत परिणाम');
            }

            return parseFloat(result.toFixed(3));
        } catch (error) {
            throw new Error('गलत गणना: ' + expression);
        }
    }

    // Enhanced Event Listeners
    setupEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Form Submission
        const form = document.getElementById('add-worker-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addWorkerEntry();
            });
        }

        // Complete Day Button
        const completeDayBtn = document.getElementById('complete-day-btn');
        if (completeDayBtn) {
            completeDayBtn.addEventListener('click', () => this.completeDay());
        }

        // Generate Full Report
        const generateReportBtn = document.getElementById('generate-full-report');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => this.generateFullReport());
        }

        // Export All Button
        const exportAllBtn = document.getElementById('export-all-btn');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => this.generateFullReport());
        }

        // Search Functionality
        const searchInput = document.getElementById('search-history');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.debounce(() => this.filterHistory(e.target.value), 300)();
            });
        }

        // Modal Events
        this.setupModalEvents();

        // FAB for Mobile
        const fab = document.getElementById('mobile-add-btn');
        if (fab) {
            fab.addEventListener('click', () => {
                this.switchTab('today');
                document.getElementById('worker-name')?.focus();
            });
        }

        // Auto-save form data
        this.setupAutoSave();
    }

    setupModalEvents() {
        // Edit Modal
        const editModal = document.getElementById('edit-modal');
        const editClose = document.getElementById('edit-modal-close');
        const editCancel = document.getElementById('edit-cancel');
        const editSave = document.getElementById('edit-save');

        if (editClose) editClose.addEventListener('click', () => this.hideModal('edit-modal'));
        if (editCancel) editCancel.addEventListener('click', () => this.hideModal('edit-modal'));
        if (editSave) editSave.addEventListener('click', () => this.saveEdit());

        // Confirm Modal
        const confirmModal = document.getElementById('confirm-modal');
        const confirmClose = document.getElementById('confirm-modal-close');
        const confirmCancel = document.getElementById('confirm-cancel');
        const confirmOk = document.getElementById('confirm-ok');

        if (confirmClose) confirmClose.addEventListener('click', () => this.hideModal('confirm-modal'));
        if (confirmCancel) confirmCancel.addEventListener('click', () => this.hideModal('confirm-modal'));
        if (confirmOk) confirmOk.addEventListener('click', () => this.handleConfirmAction());

        // Close modal on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('active');
            }
        });
    }

    setupAutoSave() {
        const inputs = ['kg-collected', 'rate-per-kg'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    localStorage.setItem(`cotton-tracker-${inputId}`, input.value);
                });

                // Restore saved values
                const saved = localStorage.getItem(`cotton-tracker-${inputId}`);
                if (saved) {
                    input.value = saved;
                }
            }
        });
    }

    // Tab Management
    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            const isActive = content.id === `${tabName}-content`;
            content.classList.toggle('active', isActive);
        });

        // Load data for specific tabs
        if (tabName === 'history') {
            this.loadHistory();
        } else if (tabName === 'reports') {
            this.updateReportsOverview();
        }

        // Update URL hash
        window.history.replaceState(null, null, `#${tabName}`);
    }

    // Enhanced Worker Entry Management
    async addWorkerEntry() {
        this.showLoading(true);

        try {
            const nameInput = document.getElementById('worker-name');
            const kgInput = document.getElementById('kg-collected');
            const rateInput = document.getElementById('rate-per-kg');
            const dateInput = document.getElementById('work-date');

            const name = nameInput?.value.trim();
            const kgExpression = kgInput?.value.trim();
            const rate = parseFloat(rateInput?.value);
            const dateValue = dateInput?.value;

            // Enhanced validation
            if (!name) {
                throw new Error('कृपया कामगार का नाम दर्ज करें');
            }

            if (name.length < 2) {
                throw new Error('नाम कम से कम 2 अक्षरों का होना चाहिए');
            }

            if (!kgExpression) {
                throw new Error('कृपया किलो की मात्रा दर्ज करें');
            }

            if (!rate || rate <= 0 || rate > 1000) {
                throw new Error('कृपया वैध दर दर्ज करें (1-1000)');
            }

            if (!dateValue) {
                throw new Error('कृपया तारीख चुनें');
            }

            const kg = this.evaluateExpression(kgExpression);
            const total = Math.round(kg * rate * 100) / 100;
            const formattedDate = this.formatDate(dateValue);

            const entry = {
                name: name,
                kg: kg,
                rate: rate,
                total: total,
                date: formattedDate,
                timestamp: new Date().toISOString(),
                saved: false
            };

            await this.saveCurrentEntry(entry);
            await this.loadCurrentSession();

            // Clear form except rate and date
            if (nameInput) nameInput.value = '';
            if (kgInput) kgInput.value = '';

            // Clear auto-saved values
            localStorage.removeItem('cotton-tracker-kg-collected');

            // Focus back to name input
            if (nameInput) nameInput.focus();

            this.showToast(`${name} को सफलतापूर्वक जोड़ा गया`, 'success');

        } catch (error) {
            console.error('Add entry error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async saveCurrentEntry(entry) {
        try {
            const transaction = this.db.transaction(['currentSession'], 'readwrite');
            const store = transaction.objectStore('currentSession');

            return new Promise((resolve, reject) => {
                const request = store.add(entry);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            throw new Error('डेटा सेव नहीं हो सका');
        }
    }

    async loadCurrentSession() {
        try {
            const transaction = this.db.transaction(['currentSession'], 'readonly');
            const store = transaction.objectStore('currentSession');

            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    this.currentSession = request.result.sort((a, b) => 
                        new Date(b.timestamp) - new Date(a.timestamp)
                    );
                    this.renderCurrentSession();
                    this.updateTodayStats();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Load session error:', error);
            this.showToast('डेटा लोड नहीं हो सका', 'error');
        }
    }

    renderCurrentSession() {
        const container = document.getElementById('today-entries');
        if (!container) return;

        if (this.currentSession.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>आज कोई एंट्री नहीं है</p>
                    <small>ऊपर से पहली एंट्री जोड़ें</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.currentSession.map((entry, index) => `
            <div class="entry-item" data-entry-id="${entry.id}">
                <div class="entry-info">
                    <div class="entry-name">${this.escapeHtml(entry.name)}</div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">KG</div>
                        <div class="entry-detail-value">${entry.kg}</div>
                    </div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">Rate</div>
                        <div class="entry-detail-value">₹${entry.rate}</div>
                    </div>
                    <div class="entry-detail">
                        <div class="entry-detail-label">Total</div>
                        <div class="entry-detail-value">₹${entry.total.toFixed(2)}</div>
                    </div>
                </div>
                <div class="entry-actions">
                    <button class="btn btn-outline btn-icon" onclick="cottonTracker.editCurrentEntry(${entry.id}, ${index})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="cottonTracker.deleteCurrentEntry(${entry.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Show/hide complete day button
        const completeDayBtn = document.getElementById('complete-day-btn');
        if (completeDayBtn) {
            completeDayBtn.style.display = this.currentSession.length > 0 ? 'flex' : 'none';
        }
    }

    updateTodayStats() {
        const totalWorkers = this.currentSession.length;
        const totalKg = this.currentSession.reduce((sum, entry) => sum + entry.kg, 0);
        const totalAmount = this.currentSession.reduce((sum, entry) => sum + entry.total, 0);

        // Update stat cards
        const workersEl = document.getElementById('today-workers');
        const kgEl = document.getElementById('today-kg');
        const amountEl = document.getElementById('today-amount');

        if (workersEl) workersEl.textContent = totalWorkers;
        if (kgEl) kgEl.textContent = totalKg.toFixed(1);
        if (amountEl) amountEl.textContent = `₹${totalAmount.toFixed(0)}`;
    }

    async editCurrentEntry(entryId, index) {
        const entry = this.currentSession.find(e => e.id === entryId);
        if (!entry) {
            this.showToast('एंट्री नहीं मिली', 'error');
            return;
        }

        this.currentEditId = entryId;
        this.currentEditIndex = index;
        this.currentEditDate = null;

        const editName = document.getElementById('edit-name');
        const editKg = document.getElementById('edit-kg');
        const editRate = document.getElementById('edit-rate');

        if (editName) editName.value = entry.name;
        if (editKg) editKg.value = entry.kg;
        if (editRate) editRate.value = entry.rate;

        this.showModal('edit-modal');
    }

    async saveEdit() {
        this.showLoading(true);

        try {
            const name = document.getElementById('edit-name')?.value.trim();
            const kg = parseFloat(document.getElementById('edit-kg')?.value);
            const rate = parseFloat(document.getElementById('edit-rate')?.value);

            if (!name || name.length < 2) {
                throw new Error('कृपया वैध नाम दर्ज करें');
            }

            if (!kg || kg <= 0 || kg > 1000) {
                throw new Error('कृपया वैध किलो दर्ज करें (0-1000)');
            }

            if (!rate || rate <= 0 || rate > 1000) {
                throw new Error('कृपया वैध दर दर्ज करें (0-1000)');
            }

            if (this.currentEditId && !this.currentEditDate) {
                // Editing current session entry
                await this.updateCurrentSessionEntry(this.currentEditId, { name, kg, rate });
            } else if (this.currentEditDate) {
                // Editing history entry
                await this.updateHistoryEntry(this.currentEditDate, this.currentEditIndex, { name, kg, rate });
            }

            this.hideModal('edit-modal');
            this.showToast('सफलतापूर्वक अपडेट किया गया', 'success');
            this.resetEditState();

        } catch (error) {
            console.error('Save edit error:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async updateCurrentSessionEntry(entryId, updates) {
        const transaction = this.db.transaction(['currentSession'], 'readwrite');
        const store = transaction.objectStore('currentSession');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(entryId);
            getRequest.onsuccess = () => {
                const entry = getRequest.result;
                entry.name = updates.name;
                entry.kg = updates.kg;
                entry.rate = updates.rate;
                entry.total = Math.round(updates.kg * updates.rate * 100) / 100;
                entry.timestamp = new Date().toISOString();

                const putRequest = store.put(entry);
                putRequest.onsuccess = async () => {
                    await this.loadCurrentSession();
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteCurrentEntry(entryId) {
        const entry = this.currentSession.find(e => e.id === entryId);
        if (!entry) return;

        this.showConfirmDialog(
            'एंट्री डिलीट करें',
            `क्या आप ${entry.name} की एंट्री डिलीट करना चाहते हैं?`,
            async () => {
                try {
                    this.showLoading(true);
                    const transaction = this.db.transaction(['currentSession'], 'readwrite');
                    const store = transaction.objectStore('currentSession');

                    return new Promise((resolve, reject) => {
                        const request = store.delete(entryId);
                        request.onsuccess = async () => {
                            await this.loadCurrentSession();
                            this.showToast('एंट्री डिलीट हो गई', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                } finally {
                    this.showLoading(false);
                }
            }
        );
    }

    async completeDay() {
        if (this.currentSession.length === 0) {
            this.showToast('कोई एंट्री नहीं है', 'warning');
            return;
        }

        const dateInput = document.getElementById('work-date');
        const formattedDate = this.formatDate(dateInput?.value || new Date());

        this.showConfirmDialog(
            'दिन पूरा करें',
            `${formattedDate} के लिए ${this.currentSession.length} एंट्रीज को हिस्ट्री में सेव करना चाहते हैं?`,
            async () => {
                try {
                    this.showLoading(true);

                    const totalKg = this.currentSession.reduce((sum, entry) => sum + entry.kg, 0);
                    const totalAmount = this.currentSession.reduce((sum, entry) => sum + entry.total, 0);

                    const historyEntry = {
                        date: formattedDate,
                        entries: this.currentSession.map(entry => ({
                            name: entry.name,
                            kg: entry.kg,
                            rate: entry.rate,
                            total: entry.total
                        })),
                        totalWorkers: this.currentSession.length,
                        totalKg: Math.round(totalKg * 100) / 100,
                        totalAmount: Math.round(totalAmount * 100) / 100,
                        completedAt: new Date().toISOString()
                    };

                    await this.saveToHistory(historyEntry);
                    await this.clearCurrentSession();
                    await this.loadCurrentSession();
                    await this.loadHistory();

                    this.showToast(`${formattedDate} का दिन पूरा हुआ`, 'success');

                } catch (error) {
                    console.error('Complete day error:', error);
                    this.showToast('दिन पूरा नहीं हो सका', 'error');
                } finally {
                    this.showLoading(false);
                }
            }
        );
    }

    async saveToHistory(historyEntry) {
        const transaction = this.db.transaction(['history'], 'readwrite');
        const store = transaction.objectStore('history');

        return new Promise((resolve, reject) => {
            // Check if entry already exists
            const getRequest = store.get(historyEntry.date);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                if (existing) {
                    // Merge with existing entry
                    historyEntry.entries = [...existing.entries, ...historyEntry.entries];
                    historyEntry.totalWorkers = existing.totalWorkers + historyEntry.totalWorkers;
                    historyEntry.totalKg = Math.round((existing.totalKg + historyEntry.totalKg) * 100) / 100;
                    historyEntry.totalAmount = Math.round((existing.totalAmount + historyEntry.totalAmount) * 100) / 100;
                }

                const putRequest = store.put(historyEntry);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async clearCurrentSession() {
        const transaction = this.db.transaction(['currentSession'], 'readwrite');
        const store = transaction.objectStore('currentSession');

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Enhanced History Management
    async loadHistory() {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');

            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    this.history = request.result.sort((a, b) => 
                        this.parseDate(b.date) - this.parseDate(a.date)
                    );
                    this.renderHistory(this.history);
                    this.updateReportsOverview();
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Load history error:', error);
            this.showToast('हिस्ट्री लोड नहीं हो सकी', 'error');
        }
    }

    renderHistory(history = this.history) {
        const container = document.getElementById('history-list');
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>कोई हिस्ट्री नहीं है</p>
                    <small>पहले कुछ दिन पूरे करें</small>
                </div>
            `;
            return;
        }

        container.innerHTML = history.map(record => `
            <div class="history-item" data-date="${record.date}">
                <div class="history-header" onclick="cottonTracker.toggleHistoryDetails('${record.date}')">
                    <div>
                        <div class="history-date">${this.formatDateDisplay(record.date)}</div>
                        <div class="history-summary">
                            <span><i class="fas fa-users"></i> ${record.totalWorkers} workers</span>
                            <span><i class="fas fa-weight-hanging"></i> ${record.totalKg.toFixed(1)} KG</span>
                            <span><i class="fas fa-rupee-sign"></i> ₹${record.totalAmount.toFixed(0)}</span>
                        </div>
                    </div>
                    <div class="history-toggle">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="history-content">
                    <div class="history-actions">
                        <button class="btn btn-outline btn-sm" onclick="cottonTracker.generateDayPDF('${record.date}')">
                            <i class="fas fa-file-pdf"></i> Generate PDF
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="cottonTracker.deleteHistoryDay('${record.date}')">
                            <i class="fas fa-trash"></i> Delete Day
                        </button>
                    </div>
                    <div class="entries-list">
                        ${record.entries.map((entry, index) => `
                            <div class="entry-item">
                                <div class="entry-info">
                                    <div class="entry-name">${this.escapeHtml(entry.name)}</div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">KG</div>
                                        <div class="entry-detail-value">${entry.kg}</div>
                                    </div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">Rate</div>
                                        <div class="entry-detail-value">₹${entry.rate}</div>
                                    </div>
                                    <div class="entry-detail">
                                        <div class="entry-detail-label">Total</div>
                                        <div class="entry-detail-value">₹${entry.total.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div class="entry-actions">
                                    <button class="btn btn-outline btn-icon" onclick="cottonTracker.editHistoryEntry('${record.date}', ${index})" title="Edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-danger btn-icon" onclick="cottonTracker.deleteHistoryEntry('${record.date}', ${index})" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    toggleHistoryDetails(date) {
        const item = document.querySelector(`[data-date="${date}"]`);
        if (!item) return;

        const isExpanded = item.classList.contains('expanded');

        // Close all other expanded items
        document.querySelectorAll('.history-item.expanded').forEach(expandedItem => {
            if (expandedItem !== item) {
                expandedItem.classList.remove('expanded');
            }
        });

        // Toggle current item
        item.classList.toggle('expanded', !isExpanded);
    }

    filterHistory(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderHistory(this.history);
            return;
        }

        const filtered = this.history.filter(record => {
            const searchLower = searchTerm.toLowerCase();
            const dateMatch = record.date.toLowerCase().includes(searchLower);
            const workerMatch = record.entries.some(entry => 
                entry.name.toLowerCase().includes(searchLower)
            );
            return dateMatch || workerMatch;
        });

        this.renderHistory(filtered);
    }

    async editHistoryEntry(date, entryIndex) {
        try {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');

            return new Promise((resolve, reject) => {
                const request = store.get(date);
                request.onsuccess = () => {
                    const historyRecord = request.result;
                    const entry = historyRecord.entries[entryIndex];

                    this.currentEditDate = date;
                    this.currentEditIndex = entryIndex;
                    this.currentEditId = null;

                    document.getElementById('edit-name').value = entry.name;
                    document.getElementById('edit-kg').value = entry.kg;
                    document.getElementById('edit-rate').value = entry.rate;

                    this.showModal('edit-modal');
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            this.showToast('एंट्री लोड नहीं हो सकी', 'error');
        }
    }

    async updateHistoryEntry(date, entryIndex, updates) {
        const transaction = this.db.transaction(['history'], 'readwrite');
        const store = transaction.objectStore('history');

        return new Promise((resolve, reject) => {
            const getRequest = store.get(date);
            getRequest.onsuccess = () => {
                const historyRecord = getRequest.result;
                const entry = historyRecord.entries[entryIndex];

                entry.name = updates.name;
                entry.kg = updates.kg;
                entry.rate = updates.rate;
                entry.total = Math.round(updates.kg * updates.rate * 100) / 100;

                // Recalculate totals
                historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);

                const putRequest = store.put(historyRecord);
                putRequest.onsuccess = async () => {
                    await this.loadHistory();
                    resolve();
                };
                putRequest.onerror = () => reject(putRequest.error);
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteHistoryEntry(date, entryIndex) {
        this.showConfirmDialog(
            'एंट्री डिलीट करें',
            'क्या आप इस एंट्री को डिलीट करना चाहते हैं?',
            async () => {
                try {
                    const transaction = this.db.transaction(['history'], 'readwrite');
                    const store = transaction.objectStore('history');

                    return new Promise((resolve, reject) => {
                        const getRequest = store.get(date);
                        getRequest.onsuccess = () => {
                            const historyRecord = getRequest.result;
                            historyRecord.entries.splice(entryIndex, 1);

                            if (historyRecord.entries.length === 0) {
                                // Delete entire day if no entries left
                                const deleteRequest = store.delete(date);
                                deleteRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('एंट्री डिलीट हो गई', 'success');
                                    resolve();
                                };
                                deleteRequest.onerror = () => reject(deleteRequest.error);
                            } else {
                                // Recalculate totals
                                historyRecord.totalKg = historyRecord.entries.reduce((sum, e) => sum + e.kg, 0);
                                historyRecord.totalAmount = historyRecord.entries.reduce((sum, e) => sum + e.total, 0);

                                const putRequest = store.put(historyRecord);
                                putRequest.onsuccess = async () => {
                                    await this.loadHistory();
                                    this.showToast('एंट्री डिलीट हो गई', 'success');
                                    resolve();
                                };
                                putRequest.onerror = () => reject(putRequest.error);
                            }
                        };
                        getRequest.onerror = () => reject(getRequest.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                }
            }
        );
    }

    async deleteHistoryDay(date) {
        this.showConfirmDialog(
            'दिन डिलीट करें',
            `क्या आप ${date} के सभी रिकॉर्ड डिलीट करना चाहते हैं?`,
            async () => {
                try {
                    const transaction = this.db.transaction(['history'], 'readwrite');
                    const store = transaction.objectStore('history');

                    return new Promise((resolve, reject) => {
                        const request = store.delete(date);
                        request.onsuccess = async () => {
                            await this.loadHistory();
                            this.showToast('दिन डिलीट हो गया', 'success');
                            resolve();
                        };
                        request.onerror = () => reject(request.error);
                    });
                } catch (error) {
                    this.showToast('डिलीट नहीं हो सका', 'error');
                }
            }
        );
    }

    // Enhanced PDF Generation with proper Marathi support and new format
    async generateDayPDF(date) {
        try {
            this.showLoading(true);
            const record = this.history.find(r => r.date === date);
            if (!record) {
                throw new Error('रिकॉर्ड नहीं मिला');
            }

            this.createEnhancedPDF([record], `CottonReport_${date.replace(/-/g, '')}.pdf`);
            this.showToast('PDF तैयार हो गया', 'success');

        } catch (error) {
            console.error('PDF generation error:', error);
            this.showToast('PDF नहीं बन सका', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async generateFullReport() {
        try {
            this.showLoading(true);

            if (this.history.length === 0) {
                this.showToast('कोई डेटा उपलब्ध नहीं है', 'warning');
                return;
            }

            const sortedHistory = this.history.sort((a, b) => 
                this.parseDate(a.date) - this.parseDate(b.date)
            );

            this.createEnhancedPDF(sortedHistory, 'CottonFullReport.pdf');
            this.showToast('संपूर्ण रिपोर्ट तैयार हो गई', 'success');

        } catch (error) {
            console.error('Full report error:', error);
            this.showToast('रिपोर्ट नहीं बन सकी', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Enhanced PDF Creation with proper Marathi support and new format
    createEnhancedPDF(historyRecords, filename) {
        if (!window.jspdf) {
            throw new Error('PDF library not loaded');
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Enable UTF-8 support
        doc.setFont('helvetica', 'normal');

        let yPosition = 20;

        // Enhanced Header with better Marathi support
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 184, 148);

        // Title in English
        doc.text('Cotton Workers Report', 20, yPosition);
        yPosition += 8;

        // Title in Devanagari (using Unicode escape sequences for better compatibility)
        doc.setFontSize(16);
        doc.setTextColor(100, 100, 100);
        doc.text('कपास कामगार रिपोर्ट', 20, yPosition);
        yPosition += 15;

        // Generation info
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        const now = new Date();
        doc.text(`Generated: ${now.toLocaleDateString('hi-IN')} ${now.toLocaleTimeString('hi-IN')}`, 20, yPosition);
        yPosition += 20;

        let grandTotalKg = 0;
        let grandTotalAmount = 0;
        let grandTotalWorkers = 0;

        historyRecords.forEach((record, recordIndex) => {
            // Check for page break
            if (yPosition > 240) {
                doc.addPage();
                yPosition = 20;
            }

            // Date section header
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text(`Date: ${record.date}`, 20, yPosition);
            yPosition += 8;

            // Rate info (since all workers on same day usually have same rate)
            const commonRate = record.entries.length > 0 ? record.entries[0].rate : 0;
            const allSameRate = record.entries.every(entry => entry.rate === commonRate);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(60, 60, 60);

            if (allSameRate) {
                doc.text(`Rate per KG: ₹${commonRate}`, 20, yPosition);
                yPosition += 8;
            }

            yPosition += 5;

            // Enhanced table with new format: Date, Rate per KG, Worker Name, Total KG Collected
            const tableData = [];

            record.entries.forEach((entry, index) => {
                // Convert Marathi names to a more compatible format for PDF
                const cleanName = this.prepareMarathiNameForPDF(entry.name);
                tableData.push([
                    record.date,
                    `₹${entry.rate}`,
                    cleanName,
                    `${entry.kg} KG`
                ]);
            });

            // Add summary row
            tableData.push([
                'TOTAL',
                '-',
                `${record.totalWorkers} Workers`,
                `${record.totalKg.toFixed(2)} KG`
            ]);

            // Generate table with autoTable
            if (doc.autoTable) {
                doc.autoTable({
                    head: [['Date', 'Rate per KG', 'Worker Name', 'Total KG Collected']],
                    body: tableData,
                    startY: yPosition,
                    styles: {
                        fontSize: 10,
                        font: 'helvetica',
                        cellPadding: 4,
                        textColor: [0, 0, 0],
                        overflow: 'linebreak'
                    },
                    headStyles: {
                        fillColor: [0, 184, 148],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 11
                    },
                    alternateRowStyles: {
                        fillColor: [248, 249, 250]
                    },
                    columnStyles: {
                        0: { cellWidth: 30 }, // Date
                        1: { cellWidth: 25 }, // Rate
                        2: { cellWidth: 50 }, // Worker Name
                        3: { cellWidth: 35 }  // KG
                    },
                    margin: { left: 20, right: 20 },
                    theme: 'grid'
                });

                yPosition = doc.lastAutoTable.finalY + 15;
            }

            // Day summary
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 184, 148);
            doc.text(`Day Total: ${record.totalWorkers} Workers, ${record.totalKg.toFixed(2)} KG, ₹${record.totalAmount.toFixed(2)}`, 20, yPosition);
            yPosition += 15;

            grandTotalKg += record.totalKg;
            grandTotalAmount += record.totalAmount;
            grandTotalWorkers += record.totalWorkers;
        });

        // Grand totals for multiple records
        if (historyRecords.length > 1) {
            if (yPosition > 240) {
                doc.addPage();
                yPosition = 20;
            }

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 184, 148);
            doc.text('GRAND SUMMARY', 20, yPosition);
            yPosition += 15;

            if (doc.autoTable) {
                doc.autoTable({
                    head: [['Description', 'Value']],
                    body: [
                        ['Total Days', `${historyRecords.length} days`],
                        ['Total Workers (All Days)', `${grandTotalWorkers} workers`],
                        ['Total KG Collected', `${grandTotalKg.toFixed(2)} KG`],
                        ['Total Amount Paid', `₹${grandTotalAmount.toFixed(2)}`],
                        ['Average per Day', `₹${(grandTotalAmount / historyRecords.length).toFixed(2)}`],
                        ['Average KG per Day', `${(grandTotalKg / historyRecords.length).toFixed(2)} KG`]
                    ],
                    startY: yPosition,
                    styles: {
                        fontSize: 12,
                        font: 'helvetica',
                        cellPadding: 5
                    },
                    headStyles: {
                        fillColor: [40, 167, 69],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold'
                    },
                    alternateRowStyles: {
                        fillColor: [248, 249, 250]
                    },
                    margin: { left: 20, right: 20 }
                });
            }
        }

        // Enhanced footer with Marathi text
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120, 120, 120);

            // Footer text
            doc.text(`Page ${i} of ${pageCount}`, 20, doc.internal.pageSize.height - 15);
            doc.text('Cotton Tracker App', doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 15, { align: 'right' });
            doc.text('कपास ट्रैकर ऐप', doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10, { align: 'right' });
        }

        // Save PDF with enhanced error handling
        try {
            doc.save(filename);
        } catch (error) {
            console.error('PDF save error:', error);
            // Fallback: try downloading as data URL
            const pdfDataUri = doc.output('datauristring');
            const link = document.createElement('a');
            link.href = pdfDataUri;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Enhanced function to prepare Marathi names for PDF
    prepareMarathiNameForPDF(name) {
        try {
            // Check if name contains Devanagari characters
            const hasDevanagari = /[\u0900-\u097F]/.test(name);

            if (hasDevanagari) {
                // For Marathi names, we'll try to keep them as is
                // but ensure they're not too long for the PDF
                if (name.length > 25) {
                    return name.substring(0, 22) + '...';
                }
                return name;
            }

            // For English names
            return name.length > 30 ? name.substring(0, 27) + '...' : name;
        } catch (error) {
            console.warn('Name processing error:', error);
            return name.substring(0, 20);
        }
    }

    updateReportsOverview() {
        const totalDays = this.history.length;
        const totalWorkers = this.history.reduce((sum, record) => sum + record.totalWorkers, 0);
        const totalKg = this.history.reduce((sum, record) => sum + record.totalKg, 0);
        const totalAmount = this.history.reduce((sum, record) => sum + record.totalAmount, 0);

        // Update overview elements
        const elements = {
            'total-days': totalDays,
            'total-workers': totalWorkers,
            'total-kg': `${totalKg.toFixed(1)} KG`,
            'total-amount': `₹${totalAmount.toFixed(0)}`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    // Utility Functions
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    resetEditState() {
        this.currentEditId = null;
        this.currentEditDate = null;
        this.currentEditIndex = null;
    }

    // UI Methods
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            const firstInput = modal.querySelector('input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    }

    showConfirmDialog(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        this.confirmCallback = onConfirm;
        this.showModal('confirm-modal');
    }

    handleConfirmAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.confirmCallback = null;
        this.hideModal('confirm-modal');
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    }

    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
            </div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.remove();
        }, duration);

        // Remove on click
        toast.addEventListener('click', () => {
            toast.remove();
        });
    }
}

// Initialize the application
let cottonTracker;
document.addEventListener('DOMContentLoaded', () => {
    cottonTracker = new CottonTracker();

    // Handle hash navigation
    const hash = window.location.hash.slice(1);
    if (['today', 'history', 'reports'].includes(hash)) {
        cottonTracker.switchTab(hash);
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    if (window.cottonTracker) {
        cottonTracker.showToast('कुछ गलत हुआ', 'error');
    }
});
