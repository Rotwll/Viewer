/**
 * Arctic Shift API client with pagination
 * Fetches posts and comments for a username
 */
class ArcticApiClient {
    static BASE_URL = 'https://arctic-shift.photon-reddit.com/api';
    static DELAY_MS = 600; // Delay between paginated requests

    /**
     * Fetch all posts and comments for a user
     * @param {string} username - Reddit username (without u/)
     * @param {function} onProgress - Callback with { posts, comments, total, currentType }
     * @returns {Promise<Array>} Normalized items
     */
    static async fetchUserHistory(username, onProgress) {
        const cleanUser = username.replace(/^u\//, '').trim();
        if (!cleanUser) throw new Error('Username is required');

        const allItems = [];
        let postCount = 0;
        let commentCount = 0;

        // Fetch posts
        onProgress?.({ posts: 0, comments: 0, total: 0, currentType: 'posts' });
        const posts = await this._paginatedFetch('posts', cleanUser, (count, total) => {
            postCount = total;
            onProgress?.({ posts: postCount, comments: commentCount, total: postCount + commentCount, currentType: 'posts' });
        });
        allItems.push(...posts.map(p => CSVParser.normalizeItem(p)));

        // Fetch comments
        onProgress?.({ posts: postCount, comments: 0, total: postCount, currentType: 'comments' });
        const comments = await this._paginatedFetch('comments', cleanUser, (count, total) => {
            commentCount = total;
            onProgress?.({ posts: postCount, comments: commentCount, total: postCount + commentCount, currentType: 'comments' });
        });
        allItems.push(...comments.map(c => CSVParser.normalizeItem(c)));

        return allItems;
    }

    /**
     * Paginate through search endpoint using created_utc cursor
     */
    static async _paginatedFetch(type, author, onProgress) {
        const endpoint = `${this.BASE_URL}/${type}/search`;
        const allResults = [];
        let after = null;
        let page = 0;
        const maxPages = 200; // Safety limit
        const limitPerPage = 100; // Arctic Shift max is often 100 for search

        while (page < maxPages) {
            const params = new URLSearchParams({
                author: author,
                limit: limitPerPage,
                sort: 'asc' // oldest first for stable pagination
            });
            if (after) params.set('after', after);

            const url = `${endpoint}?${params}`;
            const response = await this._requestWithRetry(url);
            const data = response.data || [];

            if (data.length === 0) break;

            allResults.push(...data);
            onProgress?.(page, allResults.length);

            // Get the created_utc of the last item for next page cursor
            const lastItem = data[data.length - 1];
            const lastCreated = lastItem.created_utc || lastItem.created;
            if (!lastCreated) break;

            // Use created_utc as the after cursor (epoch seconds)
            after = lastCreated;
            page++;

            // Delay between requests to be respectful
            if (data.length === limitPerPage) {
                await this._sleep(this.DELAY_MS);
            } else {
                break; // Last page
            }
        }

        return allResults;
    }

    /**
     * Request with retry on rate limit (429) and timeout
     */
    static async _requestWithRetry(url, maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });

                if (response.status === 429) {
                    const resetAt = response.headers.get('X-RateLimit-Reset-At');
                    const waitMs = resetAt ? (parseInt(resetAt) * 1000 - Date.now()) : 5000;
                    await this._sleep(Math.max(waitMs, 2000));
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`Arctic Shift API error: ${response.status} ${response.statusText}`);
                }

                return await response.json();
            } catch (err) {
                if (attempt === maxRetries - 1) throw err;
                await this._sleep(2000 * (attempt + 1)); // Exponential backoff
            }
        }
    }

    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}