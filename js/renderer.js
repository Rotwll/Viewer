/**
 * Renderer for Reddit activity data with media support - Fixed duplicate media
 * Reddit-style card layout: vote column + main content column
 */
class ActivityRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = [];
        this.filteredData = [];
        this.filters = {
            type: 'all',
            search: '',
            subreddit: '',
            sortBy: 'date'
        };
        this.sortAscending = false;
        // Cache for processed media URLs to prevent duplicates
        this._mediaCache = new Set();
    }

    setData(data) {
        this.data = data;
        this._mediaCache = new Set(); // Reset cache on new data
        this.applyFilters();
        this.render();
    }

    applyFilters() {
        this.filteredData = this.data.filter(item => {
            // Type filter
            if (this.filters.type !== 'all' && item.Type !== this.filters.type) {
                return false;
            }

            // Search filter
            if (this.filters.search) {
                const searchLower = this.filters.search.toLowerCase();
                const title = (item.Title || '').toLowerCase();
                const content = (item.Content || '').toLowerCase();
                const subreddit = (item.Subreddit || '').toLowerCase();
                const author = (item.Author || '').toLowerCase();

                if (!title.includes(searchLower) &&
                    !content.includes(searchLower) &&
                    !subreddit.includes(searchLower) &&
                    !author.includes(searchLower)) {
                    return false;
                }
            }

            // Subreddit filter
            if (this.filters.subreddit && item.Subreddit !== this.filters.subreddit) {
                return false;
            }

            return true;
        });

        this.sortData();
    }

    sortData() {
        if (this.filters.sortBy === 'score') {
            this.filteredData.sort((a, b) => {
                const scoreA = parseInt(a.Score) || 0;
                const scoreB = parseInt(b.Score) || 0;
                return this.sortAscending ? scoreA - scoreB : scoreB - scoreA;
            });
        } else {
            this.filteredData.sort((a, b) => {
                const dateA = new Date(a['Date & Time (UTC)'] || 0);
                const dateB = new Date(b['Date & Time (UTC)'] || 0);
                return this.sortAscending ? dateA - dateB : dateB - dateA;
            });
        }
    }

    render() {
        if (this.filteredData.length === 0) {
            this.renderEmpty();
            return;
        }

        const html = this.filteredData.map(item => this.renderCard(item)).join('');
        this.container.innerHTML = html;
    }

    renderCard(item) {
        const type = item.Type || 'Comment';
        const isPost = type === 'Post';
        const subreddit = item.Subreddit || 'unknown';
        const timestamp = item['Date & Time (UTC)'] || '';
        const score = item.Score || '0';
        const title = item.Title || '';
        const content = item.Content || '';
        const author = item.Author || 'unknown';
        const flair = item.Flair || '';
        const permalink = item.Permalink || '';
        const domain = item.Domain || '';
        const upvoteRatio = item.UpvoteRatio || 0;
        const numComments = item.NumComments || 0;

        // Get media with deduplication
        const media = this.getUniqueMedia(item);

        // Build card: vote column + main column (Reddit layout)
        let html = `
            <div class="activity-card">
                <div class="card-votes">
                    <button class="vote-btn vote-up" title="Upvote" aria-label="Upvote">▲</button>
                    <span class="vote-score">${this.escapeHtml(score)}</span>
                    <button class="vote-btn vote-down" title="Downvote" aria-label="Downvote">▼</button>
                </div>
                <div class="card-main">
                    <div class="card-header">
                        <div class="card-header-left">
                            <span class="card-type-badge ${isPost ? 'badge-post' : 'badge-comment'}">
                                ${isPost ? '📰' : '💬'} ${type}
                            </span>
                            <span class="card-subreddit">r/${this.escapeHtml(subreddit)}</span>
                            ${flair ? `<span class="card-flair" title="${this.escapeHtml(flair)}">${this.escapeHtml(flair)}</span>` : ''}
                            ${domain ? `<span class="card-domain">${this.escapeHtml(domain)}</span>` : ''}
                        </div>
                        <div class="card-header-right">
                            <span class="card-author">by <span class="author-name">u/${this.escapeHtml(author)}</span></span>
                            <span class="card-time">🕒 ${this.escapeHtml(timestamp)}</span>
                            <span class="card-score-display">
                                <span class="upvote-icon">⬆️</span>
                                <span class="score-number">${this.escapeHtml(score)}</span>
                                ${isPost ? `<span class="score-meta">(${Math.round(upvoteRatio * 100)}%)</span>` : ''}
                                ${isPost && numComments > 0 ? `<span class="score-meta">💬 ${numComments}</span>` : ''}
                            </span>
                        </div>
                    </div>
        `;

        // Title (if present)
        if (title) {
            html += `<div class="card-title">${this.escapeHtml(title)}</div>`;
        }

        // Content (selftext/body)
        if (content && content !== '[removed]') {
            html += `<div class="card-content">${this.escapeHtml(content)}</div>`;
        }

        // Media rendering
        html += this.renderMedia(media);

        // External link
        if (item.URL && !item.IsSelf && !item.URL.includes('reddit.com')) {
            html += `
                <div class="card-external-link">
                    <a href="${this.escapeHtml(item.URL)}" target="_blank" rel="noopener noreferrer">🔗 ${this.escapeHtml(item.URL)}</a>
                </div>
            `;
        }

        // Permalink
        if (item.ID) {
            const link = permalink ? `https://reddit.com${permalink}` : `https://reddit.com/comments/${item.ID}`;
            html += `
                <div class="card-permalink">
                    <a href="${this.escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
                        View on Reddit →
                    </a>
                </div>
            `;
        }

        // Close card-main and activity-card
        html += `
                </div>
            </div>
        `;
        return html;
    }

    /**
     * Get unique media URLs for an item (prevents duplicates)
     */
    getUniqueMedia(item) {
        const media = item._mediaUrls || {
            images: [],
            videos: [],
            externalLinks: [],
            gallery: [],
            redditMedia: []
        };

        // Collect all URLs and deduplicate using Set
        const allUrls = new Set();
        const result = {
            images: [],
            videos: [],
            externalLinks: [],
            gallery: [],
            redditMedia: []
        };

        // Helper to add URL to the appropriate category if not already seen
        const addUrl = (url, category) => {
            if (!url || !url.startsWith('http')) return;
            // Normalize URL to prevent duplicates with different query params
            const normalizedUrl = this.normalizeUrl(url);
            if (allUrls.has(normalizedUrl)) return;
            allUrls.add(normalizedUrl);
            result[category].push(url);
        };

        // Process each category
        for (const img of (media.images || [])) addUrl(img, 'images');
        for (const img of (media.gallery || [])) addUrl(img, 'gallery');
        for (const img of (media.redditMedia || [])) {
            if (this.isImageUrl(img)) {
                addUrl(img, 'images');
            } else {
                addUrl(img, 'redditMedia');
            }
        }
        for (const vid of (media.videos || [])) addUrl(vid, 'videos');
        for (const link of (media.externalLinks || [])) addUrl(link, 'externalLinks');

        return result;
    }

    /**
     * Normalize URL to prevent duplicate detection
     */
    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            // Remove common tracking parameters
            urlObj.searchParams.delete('utm_source');
            urlObj.searchParams.delete('utm_medium');
            urlObj.searchParams.delete('utm_campaign');
            urlObj.searchParams.delete('utm_term');
            urlObj.searchParams.delete('utm_content');
            return urlObj.toString();
        } catch (e) {
            return url;
        }
    }

    /**
     * Check if URL is an image
     */
    isImageUrl(url) {
        if (!url) return false;
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico)(\?.*)?$/i;
        return imageExtensions.test(url) ||
               url.includes('i.redd.it') ||
               url.includes('i.imgur.com') ||
               url.includes('preview.redd.it');
    }

    renderMedia(media) {
        let html = '';

        // Combine images from various sources
        let allImages = [...(media.images || []), ...(media.gallery || [])];
        // Remove duplicates again
        const seen = new Set();
        allImages = allImages.filter(url => {
            const normalized = this.normalizeUrl(url);
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });

        const videos = media.videos || [];

        // Render images
        if (allImages.length > 0) {
            html += `<div class="card-media-container">`;
            if (allImages.length > 1) {
                html += `<div class="gallery-grid">`;
                for (const imgUrl of allImages.slice(0, 10)) {
                    html += `
                        <img src="${this.escapeHtml(imgUrl)}"
                             alt="Image preview"
                             loading="lazy"
                             onclick="window.open('${this.escapeHtml(imgUrl)}', '_blank')"
                             onerror="this.style.display='none'">
                    `;
                }
                if (allImages.length > 10) {
                    html += `<div style="display:flex;align-items:center;justify-content:center;background:var(--color-surface-alt);border-radius:var(--radius-sm);color:var(--color-text-muted);min-height:100px;">
                                +${allImages.length - 10} more
                            </div>`;
                }
                html += `</div>`;
            } else {
                html += `
                    <img src="${this.escapeHtml(allImages[0])}"
                         alt="Image preview"
                         loading="lazy"
                         onclick="window.open('${this.escapeHtml(allImages[0])}', '_blank')"
                         onerror="this.style.display='none'">
                `;
            }
            html += `</div>`;
        }

        // Render videos (deduplicated)
        if (videos.length > 0) {
            const uniqueVideos = [];
            const videoSeen = new Set();
            for (const vid of videos) {
                const normalized = this.normalizeUrl(vid);
                if (!videoSeen.has(normalized)) {
                    videoSeen.add(normalized);
                    uniqueVideos.push(vid);
                }
            }

            if (uniqueVideos.length > 0) {
                html += `<div class="card-media-container">`;
                for (const videoUrl of uniqueVideos) {
                    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
                        const embedUrl = this.getYouTubeEmbedUrl(videoUrl);
                        if (embedUrl) {
                            html += `
                                <div class="video-container">
                                    <iframe src="${embedUrl}"
                                            allowfullscreen
                                            loading="lazy"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                                    </iframe>
                                </div>
                            `;
                        }
                    } else {
                        html += `
                            <video controls preload="metadata" onclick="this.paused ? this.play() : this.pause()">
                                <source src="${this.escapeHtml(videoUrl)}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                        `;
                    }
                }
                html += `</div>`;
            }
        }

        return html;
    }

    getYouTubeEmbedUrl(url) {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                const videoId = urlObj.searchParams.get('v');
                if (videoId) return `https://www.youtube.com/embed/${videoId}`;
            } else if (urlObj.hostname.includes('youtu.be')) {
                const videoId = urlObj.pathname.slice(1);
                return `https://www.youtube.com/embed/${videoId}`;
            }
        } catch (e) {}
        return null;
    }

    renderEmpty() {
        const message = this.data.length === 0 ?
            'No data loaded. Upload Arctic Shift files to begin.' :
            'No items match the current filters.';

        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>${message}</h3>
                ${this.data.length > 0 ? `<p>Try adjusting your search or filters</p>` : ''}
            </div>
        `;
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    updateFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.applyFilters();
        this.render();
    }

    toggleSort(field) {
        if (this.filters.sortBy === field) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.filters.sortBy = field;
            this.sortAscending = false;
        }
        this.applyFilters();
        this.render();
    }

    getSubreddits() {
        const subreddits = new Set();
        for (const item of this.data) {
            if (item.Subreddit) {
                subreddits.add(item.Subreddit);
            }
        }
        return Array.from(subreddits).sort();
    }

    getStats() {
        const total = this.data.length;
        const posts = this.data.filter(item => item.Type === 'Post').length;
        const comments = this.data.filter(item => item.Type === 'Comment').length;
        const subreddits = this.getSubreddits().length;
        const totalScore = this.data.reduce((sum, item) => sum + (parseInt(item.Score) || 0), 0);

        return { total, posts, comments, subreddits, totalScore };
    }
}