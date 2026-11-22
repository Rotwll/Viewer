/**
 * Main Application - Strict user verification
 * All uploaded files must belong to the same user
 */
class RedditActivityApp {
    constructor() {
        // DOM elements
        this.fileInput = document.getElementById('fileInput');
        this.uploadZone = document.getElementById('uploadZone');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.fileInfo = document.getElementById('fileInfo');
        this.uploadStatus = document.getElementById('uploadStatus');
        this.statsDashboard = document.getElementById('statsDashboard');
        this.filtersSection = document.getElementById('filtersSection');
        this.searchInput = document.getElementById('searchInput');
        this.subredditFilter = document.getElementById('subredditFilter');
        this.sortScoreBtn = document.getElementById('sortScoreBtn');
        this.sortDateBtn = document.getElementById('sortDateBtn');
        this.userBadge = document.getElementById('userBadge');

        // API elements (always visible)
        this.usernameSearchInput = document.getElementById('usernameSearchInput');
        this.fetchUserBtn = document.getElementById('fetchUserBtn');
        this.saveDirBtn = document.getElementById('saveDirBtn');
        this.apiProgress = document.getElementById('apiProgress');
        this.apiProgressText = document.getElementById('apiProgressText');
        this.apiProgressBar = document.getElementById('apiProgressBar');
        this.directoryHandle = null;

        // Stats elements
        this.totalItems = document.getElementById('totalItems');
        this.postCount = document.getElementById('postCount');
        this.commentCount = document.getElementById('commentCount');
        this.subredditCount = document.getElementById('subredditCount');
        this.totalScore = document.getElementById('totalScore');

        // Activity feed
        this.activityFeed = document.getElementById('activityFeed');

        // Data store - only one user at a time
        this.accumulatedData = [];
        this.currentUser = null;
        this.filesLoaded = [];
        this.isProcessing = false;

        // Initialize renderer
        this.renderer = new ActivityRenderer('activityFeed');

        // Bind events
        this.bindEvents();
    }

    bindEvents() {
        // Upload button
        this.uploadBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        // Clear button
        this.clearBtn.addEventListener('click', () => {
            this.clearData();
        });

        // File input
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFiles(e.target.files);
            }
            this.fileInput.value = '';
        });

        // Drag and drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        });

        this.uploadZone.addEventListener('click', (e) => {
            if (!e.target.closest('.upload-btn') && !e.target.closest('.upload-btn-secondary')) {
                this.fileInput.click();
            }
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn[data-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderer.updateFilters({ type: btn.dataset.type });
                this.updateStats();
            });
        });

        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.renderer.updateFilters({ search: e.target.value });
            this.updateStats();
        });

        // Subreddit filter
        this.subredditFilter.addEventListener('change', (e) => {
            this.renderer.updateFilters({ subreddit: e.target.value });
            this.updateStats();
        });

        // Sort buttons
        this.sortScoreBtn.addEventListener('click', () => {
            this.renderer.toggleSort('score');
            this.updateSortButtons('score');
            this.updateStats();
        });

        this.sortDateBtn.addEventListener('click', () => {
            this.renderer.toggleSort('date');
            this.updateSortButtons('date');
            this.updateStats();
        });

        // API username search (always visible)
        this.fetchUserBtn.addEventListener('click', () => this.fetchUserFromApi());
        this.usernameSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.fetchUserFromApi();
        });

        // Save to directory button
        this.saveDirBtn.addEventListener('click', () => this.saveToDirectory());
    }

    updateSortButtons(activeField) {
        document.querySelectorAll('.filter-btn[id^="sort"]').forEach(btn => {
            btn.classList.remove('active-sort');
        });
        if (activeField === 'score') {
            this.sortScoreBtn.classList.add('active-sort');
        } else {
            this.sortDateBtn.classList.add('active-sort');
        }
    }

    /**
     * Detect the primary user from a dataset
     * Returns the most common author, or null if none
     */
    detectUser(data) {
        if (!data || data.length === 0) return null;

        const authorCounts = {};
        for (const item of data) {
            const author = item.Author || item.author || 'unknown';
            if (author && author !== 'unknown' && author !== '[deleted]') {
                authorCounts[author] = (authorCounts[author] || 0) + 1;
            }
        }

        // Find the most common author
        let maxCount = 0;
        let primaryAuthor = null;
        for (const [author, count] of Object.entries(authorCounts)) {
            if (count > maxCount) {
                maxCount = count;
                primaryAuthor = author;
            }
        }

        // Only return if the author appears in at least 50% of items
        if (maxCount >= data.length * 0.3) {
            return primaryAuthor;
        }

        // If there are multiple authors, return the most common one
        return primaryAuthor;
    }

    /**
     * Check if a file contains data from a single user
     */
    isSingleUserFile(data) {
        if (!data || data.length === 0) return false;

        const authorCounts = {};
        for (const item of data) {
            const author = item.Author || item.author || 'unknown';
            if (author && author !== 'unknown' && author !== '[deleted]') {
                authorCounts[author] = (authorCounts[author] || 0) + 1;
            }
        }

        const authors = Object.keys(authorCounts);
        if (authors.length === 0) return false;

        // Check if one author dominates (at least 80% of items)
        const totalItems = data.length;
        const maxCount = Math.max(...Object.values(authorCounts));
        return maxCount / totalItems >= 0.8;
    }

    /**
     * Get all unique users from a dataset
     */
    getUsersInData(data) {
        const users = new Set();
        for (const item of data) {
            const author = item.Author || item.author || 'unknown';
            if (author && author !== 'unknown' && author !== '[deleted]') {
                users.add(author);
            }
        }
        return Array.from(users);
    }

    /**
     * Handle multiple files uploaded at once with strict user verification
     */
    handleFiles(fileList) {
        if (this.isProcessing) {
            this.fileInfo.textContent = '⏳ Please wait, processing files...';
            this.fileInfo.className = 'file-info loading';
            return;
        }

        const files = Array.from(fileList);
        const totalFiles = files.length;
        let processed = 0;
        let allData = [];
        let errors = [];
        let fileResults = [];
        let detectedUsers = new Set();

        this.isProcessing = true;

        // Show loading status
        this.fileInfo.textContent = `📄 Processing ${totalFiles} file(s)...`;
        this.fileInfo.className = 'file-info loading';
        this.clearBtn.style.display = 'none';

        // Process each file
        for (const file of files) {
            this.processSingleFile(file, (data, error, fileName) => {
                processed++;

                if (error) {
                    errors.push({ file: fileName, error: error });
                } else if (data && data.length > 0) {
                    // Check if this file contains data from a single user
                    if (!this.isSingleUserFile(data)) {
                        const users = this.getUsersInData(data);
                        errors.push({
                            file: fileName,
                            error: `File contains data from multiple users: ${users.join(', ')}`
                        });
                    } else {
                        const user = this.detectUser(data);
                        if (user) {
                            detectedUsers.add(user);
                            fileResults.push({ file: fileName, count: data.length, user: user });
                            allData = allData.concat(data);
                            this.filesLoaded.push(fileName);
                        } else {
                            errors.push({ file: fileName, error: 'Could not detect user in file' });
                        }
                    }
                }

                // Update progress
                this.fileInfo.textContent = `📄 Processing ${processed}/${totalFiles} files... (${allData.length} items found)`;

                // When all files are processed
                if (processed === totalFiles) {
                    this.finishProcessing(allData, errors, fileResults, detectedUsers);
                }
            });
        }
    }

    /**
     * Process a single file
     */
    processSingleFile(file, callback) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = CSVParser.parse(e.target.result);
                callback(data, null, file.name);
            } catch (error) {
                callback(null, error.message, file.name);
            }
        };

        reader.onerror = () => {
            callback(null, 'Error reading file', file.name);
        };

        reader.readAsText(file, 'UTF-8');
    }

    /**
     * Finish processing with strict user verification
     */
    finishProcessing(allData, errors, fileResults, detectedUsers) {
        this.isProcessing = false;

        if (allData.length === 0) {
            const errorMsg = errors.length > 0 ?
                `No valid data loaded. Errors: ${errors.map(e => `${e.file}: ${e.error}`).join('; ')}` :
                'No valid Reddit data found in any file.';
            this.showError(errorMsg);
            return;
        }

        // Check if all files belong to the same user
        const userArray = Array.from(detectedUsers);

        // Find files that didn't have a detected user (shouldn't happen if we checked above)
        const undetectedFiles = fileResults.filter(r => !r.user);
        if (undetectedFiles.length > 0) {
            this.showError(`Some files couldn't be matched to a user: ${undetectedFiles.map(f => f.file).join(', ')}`);
            return;
        }

        // Check if we have multiple users
        if (userArray.length > 1) {
            // Clear any existing data first
            this.clearData();

            // Show error with list of users found
            const userList = userArray.map(u => `u/${u}`).join(', ');
            this.showError(`Files belong to different users: ${userList}. Please upload files from a single user only.`);

            // Log the issue
            console.warn('Multiple users detected:', userArray, fileResults);
            return;
        }

        // Single user detected
        const singleUser = userArray[0];

        // Check if this is a different user than the current one
        if (this.currentUser && this.currentUser !== singleUser) {
            // Different user detected - clear current data first
            this.clearData();
            // Show message that we're switching users
            this.fileInfo.textContent = `🔄 Switching from u/${this.currentUser} to u/${singleUser}...`;
            this.fileInfo.className = 'file-info loading';
        }

        // Store the current user
        this.currentUser = singleUser;

        // Build file breakdown for display
        let fileBreakdown = fileResults.map(r =>
            `${r.file}: ${r.count} items (u/${r.user})`
        ).join(' • ');

        // Set data in renderer
        this.renderer.setData(allData);
        this.accumulatedData = allData;

        // Update UI
        this.showDashboard();
        this.updateStats();
        this.updateSubredditFilter();
        this.updateUserBadge(singleUser);
        this.showClearButton();
        this.saveDirBtn.style.display = 'inline-block';

        // Success message
        const posts = allData.filter(item => item.Type === 'Post').length;
        const comments = allData.filter(item => item.Type === 'Comment').length;

        let statusMsg = `✅ User: u/${singleUser} — ${allData.length} items (${posts} posts, ${comments} comments)`;
        if (this.filesLoaded.length > 1) {
            statusMsg += ` from ${this.filesLoaded.length} files`;
        }
        if (errors.length > 0) {
            statusMsg += ` ⚠️ ${errors.length} file(s) had issues`;
        }

        this.fileInfo.textContent = statusMsg;
        this.fileInfo.className = 'file-info success';

        // Update upload status with user info
        this.updateUploadStatus(singleUser, fileBreakdown, errors);

        console.log('Loaded data:', {
            user: singleUser,
            totalItems: allData.length,
            posts: posts,
            comments: comments,
            files: this.filesLoaded,
            errors: errors
        });
    }

    /**
     * Fetch a user's entire history from Arctic Shift API
     */
    async fetchUserFromApi() {
        const username = this.usernameSearchInput.value.trim();
        if (!username) {
            this.showError('Please enter a username');
            return;
        }

        if (this.isProcessing) {
            this.fileInfo.textContent = '⏳ Please wait, another operation is in progress...';
            return;
        }

        // Clear existing data first (single user only)
        this.clearData();
        this.isProcessing = true;

        // Show progress
        this.apiProgress.style.display = 'block';
        this.apiProgressText.textContent = `Fetching history for u/${username.replace(/^u\//, '')}...`;
        this.apiProgressBar.style.width = '0%';

        try {
            const items = await ArcticApiClient.fetchUserHistory(username, (progress) => {
                const label = progress.currentType === 'posts'
                    ? `Fetching posts... (${progress.posts} found)`
                    : `Fetching comments... (${progress.comments} found)`;
                this.apiProgressText.textContent = `${label} — Total: ${progress.total} items`;
                // Estimate progress: posts typically finish first
                const estimatedTotal = progress.total > 0 ? progress.total : 1;
                this.apiProgressBar.style.width = Math.min(90, (progress.total / (estimatedTotal * 1.2)) * 100) + '%';
            });

            if (items.length === 0) {
                this.showError(`No activity found for u/${username.replace(/^u\//, '')}`);
                return;
            }

            // Detect user from fetched data
            const detectedUser = this.detectUser(items);
            this.currentUser = detectedUser || username.replace(/^u\//, '');

            // Set data
            this.renderer.setData(items);
            this.accumulatedData = items;

            // Update UI
            this.showDashboard();
            this.updateStats();
            this.updateSubredditFilter();
            this.updateUserBadge(this.currentUser);
            this.showClearButton();
            this.saveDirBtn.style.display = 'inline-block';

            // Update file info
            const posts = items.filter(i => i.Type === 'Post').length;
            const comments = items.filter(i => i.Type === 'Comment').length;
            this.fileInfo.textContent = `✅ u/${this.currentUser} — ${items.length} items (${posts} posts, ${comments} comments) fetched from API`;
            this.fileInfo.className = 'file-info success';

            // Update upload status
            this.uploadStatus.innerHTML = `
                <div class="upload-status-item">
                    <span class="status-dot loaded"></span>
                    👤 u/${this.currentUser} — fetched via Arctic Shift API
                </div>
                <div class="upload-status-item" style="font-size:0.75rem;color:#6a7a9a;">
                    📡 Data held in memory (not saved to disk)
                </div>
            `;
            this.uploadStatus.style.display = 'flex';

            // Complete progress
            this.apiProgressBar.style.width = '100%';
            this.apiProgressText.textContent = `✅ Fetched ${items.length} items for u/${this.currentUser}`;
            setTimeout(() => { this.apiProgress.style.display = 'none'; }, 3000);

        } catch (err) {
            console.error('API fetch error:', err);
            this.showError(`API fetch failed: ${err.message}`);
            this.apiProgress.style.display = 'none';
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Save accumulated data to a user-selected directory using File System Access API
     */
    async saveToDirectory() {
        if (this.accumulatedData.length === 0) {
            this.showError('No data to save');
            return;
        }

        try {
            // Request directory access (browser will prompt)
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: this.directoryHandle || 'downloads'
            });
            this.directoryHandle = dirHandle;

            const filename = `reddit_${this.currentUser}_${Date.now()}.jsonl`;
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();

            // Write as JSON Lines
            for (const item of this.accumulatedData) {
                await writable.write(JSON.stringify(item._raw || item) + '\n');
            }
            await writable.close();

            this.fileInfo.textContent = `💾 Saved ${this.accumulatedData.length} items to ${filename}`;
            this.fileInfo.className = 'file-info success';

        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled the directory picker
                return;
            }
            console.error('Save error:', err);
            this.showError(`Save failed: ${err.message}`);
        }
    }

    /**
     * Update user badge in header
     */
    updateUserBadge(user) {
        if (this.userBadge) {
            this.userBadge.textContent = `👤 u/${user}`;
            this.userBadge.style.display = 'inline-block';
        }
    }

    /**
     * Show clear button
     */
    showClearButton() {
        this.clearBtn.style.display = 'inline-block';
    }

    /**
     * Update upload status display
     */
    updateUploadStatus(user, fileBreakdown, errors) {
        let html = `
            <div class="upload-status-item">
                <span class="status-dot loaded"></span>
                👤 u/${user} — all files belong to this user
            </div>
            <div class="upload-status-item" style="font-size:0.75rem;color:#6a7a9a;max-width:100%;word-break:break-all;">
                📁 ${fileBreakdown}
            </div>
        `;

        if (errors.length > 0) {
            html += `
                <div class="upload-status-item" style="color:#fbbf24;font-size:0.75rem;">
                    ⚠️ ${errors.length} file(s) had issues: ${errors.map(e => e.file).join(', ')}
                </div>
            `;
        }

        this.uploadStatus.innerHTML = html;
        this.uploadStatus.style.display = 'flex';
    }

    /**
     * Clear all loaded data
     */
    clearData() {
        this.accumulatedData = [];
        this.filesLoaded = [];
        this.currentUser = null;
        this.uploadStatus.innerHTML = '';
        this.uploadStatus.style.display = 'none';
        this.clearBtn.style.display = 'none';
        this.saveDirBtn.style.display = 'none';
        this.apiProgress.style.display = 'none';
        this.apiProgressBar.style.width = '0%';
        if (this.userBadge) {
            this.userBadge.style.display = 'none';
        }
        this.renderer.setData([]);
        this.statsDashboard.style.display = 'none';
        this.filtersSection.style.display = 'none';
        this.fileInfo.textContent = '📂 Ready for upload';
        this.fileInfo.className = 'file-info';
        this.isProcessing = false;
    }

    updateStats() {
        const stats = this.renderer.getStats();
        const filteredStats = this.renderer.filteredData.length;

        this.totalItems.textContent = filteredStats;
        this.postCount.textContent = this.renderer.filteredData.filter(item => item.Type === 'Post').length;
        this.commentCount.textContent = this.renderer.filteredData.filter(item => item.Type === 'Comment').length;

        const subreddits = new Set();
        let scoreSum = 0;
        for (const item of this.renderer.filteredData) {
            if (item.Subreddit) {
                subreddits.add(item.Subreddit);
            }
            scoreSum += parseInt(item.Score) || 0;
        }
        this.subredditCount.textContent = subreddits.size;
        this.totalScore.textContent = scoreSum;
    }

    updateSubredditFilter() {
        const subreddits = this.renderer.getSubreddits();

        while (this.subredditFilter.options.length > 1) {
            this.subredditFilter.remove(1);
        }

        for (const sub of subreddits) {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = `r/${sub}`;
            this.subredditFilter.appendChild(option);
        }
    }

    showDashboard() {
        this.statsDashboard.style.display = 'grid';
        this.filtersSection.style.display = 'block';
        this.sortDateBtn.classList.add('active-sort');
    }

    showError(message) {
        this.isProcessing = false;
        this.fileInfo.textContent = `❌ ${message}`;
        this.fileInfo.className = 'file-info error';
        this.clearBtn.style.display = 'none';
        this.uploadStatus.innerHTML = '';
        this.uploadStatus.style.display = 'none';
        this.saveDirBtn.style.display = 'none';
        if (this.userBadge) {
            this.userBadge.style.display = 'none';
        }
        // Don't clear data on error - keep existing data if any
        // But if the error is about multiple users, we clear it
        if (message.includes('different users')) {
            this.clearData();
        }
        this.renderer.setData(this.accumulatedData);
        this.statsDashboard.style.display = this.accumulatedData.length > 0 ? 'grid' : 'none';
        this.filtersSection.style.display = this.accumulatedData.length > 0 ? 'block' : 'none';
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    const app = new RedditActivityApp();
    window.app = app;
});