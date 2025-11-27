document.addEventListener('DOMContentLoaded', () => {
    // --- Mock API Server ---
    const mockApi = {
        db: {
            users: [
                { id: 'user_1', username: 'alice', email: 'alice@example.com', created_at: new Date('2023-10-27T10:00:00Z').toISOString() },
                { id: 'user_2', username: 'bob', email: 'bob@example.com', created_at: new Date('2023-10-27T10:05:00Z').toISOString() },
            ],
            nextUserId: 3,
        },
        
        createResponse(data, status = 200, headers = {}) {
            const body = (data === null || data === undefined) ? '' : JSON.stringify(data, null, 2);
            return Promise.resolve(new Response(body, {
                status,
                headers: { 'Content-Type': 'application/json', ...headers },
            }));
        },

        handleRequest(url, options = {}) {
            const path = new URL(url).pathname.replace('/v1', '');
            const method = options.method || 'GET';
            const authHeader = options.headers.get('Authorization');

            if (!authHeader || authHeader !== 'Bearer websim_dev_key') {
                return this.createResponse({ error: { type: 'authentication_error', message: 'Invalid API Key provided.' }}, 401);
            }
            
            // GET /users
            if (method === 'GET' && path === '/users') {
                const params = new URL(url).searchParams;
                const limit = parseInt(params.get('limit') || '20', 10);
                const offset = parseInt(params.get('offset') || '0', 10);
                const results = this.db.users.slice(offset, offset + limit);
                return this.createResponse({ data: results, has_more: (offset + limit) < this.db.users.length });
            }

            // GET /users/{id}
            const userMatch = path.match(/^\/users\/(user_\d+)$/);
            if (method === 'GET' && userMatch) {
                const userId = userMatch[1];
                const user = this.db.users.find(u => u.id === userId);
                return user ? this.createResponse(user) : this.createResponse({ error: { type: 'invalid_request_error', message: `No such user: ${userId}` }}, 404);
            }

            // POST /users
            if (method === 'POST' && path === '/users') {
                const body = JSON.parse(options.body);
                if (!body.username || !body.email || !body.password) {
                     return this.createResponse({ error: { type: 'invalid_request_error', message: 'Missing required parameters.' }}, 400);
                }
                const newUser = {
                    id: `user_${this.db.nextUserId++}`,
                    username: body.username,
                    email: body.email,
                    created_at: new Date().toISOString()
                };
                this.db.users.push(newUser);
                return this.createResponse(newUser, 201);
            }

            // PUT /users/{id}
             if (method === 'PUT' && userMatch) {
                const userId = userMatch[1];
                let user = this.db.users.find(u => u.id === userId);
                if (!user) return this.createResponse({ error: { type: 'invalid_request_error', message: `No such user: ${userId}` }}, 404);
                
                const body = JSON.parse(options.body);
                user = { ...user, ...body };
                this.db.users = this.db.users.map(u => u.id === userId ? user : u);
                return this.createResponse(user);
            }

            // DELETE /users/{id}
            if (method === 'DELETE' && userMatch) {
                const userId = userMatch[1];
                const userIndex = this.db.users.findIndex(u => u.id === userId);
                if (userIndex === -1) return this.createResponse({ error: { type: 'invalid_request_error', message: `No such user: ${userId}` }}, 404);
                
                this.db.users.splice(userIndex, 1);
                return this.createResponse(null, 204);
            }

            return this.createResponse({ error: { message: 'Endpoint not found' }}, 404);
        }
    };

    // Intercept fetch calls
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        const urlString = url.toString();
        if (urlString.startsWith('https://api.websim.dev/v1/')) {
            console.log(`[Mock API] Intercepted ${options.method || 'GET'} ${urlString}`);
            // Add a small delay to simulate network latency
            return new Promise(resolve => setTimeout(() => resolve(mockApi.handleRequest(url, options)), 300));
        }
        return originalFetch.apply(this, arguments);
    };


    // --- Page Interactivity ---

    // Smooth scrolling for sidebar links
    document.querySelectorAll('.sidebar a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Add copy buttons to all <pre> blocks
    document.querySelectorAll('pre').forEach(pre => {
        const code = pre.querySelector('code');
        if (!code) return;
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-btn';
        copyButton.textContent = 'Copy';
        pre.appendChild(copyButton);

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(code.innerText).then(() => {
                copyButton.textContent = 'Copied!';
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                    copyButton.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                copyButton.textContent = 'Failed';
                 setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
            });
        });
    });
    
    // "Try it out" functionality
    document.querySelectorAll('.execute-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const container = button.closest('.try-it-out');
            const responseContainer = container.querySelector('.response-container');
            let endpoint = container.dataset.endpoint;
            const method = container.dataset.method;

            const options = {
                method: method,
                headers: new Headers({
                    'Authorization': `Bearer ${document.getElementById('apiKey').value}`
                })
            };

            const queryParams = new URLSearchParams();
            let hasPathParams = false;

            // Collect parameters
            container.querySelectorAll('input[data-param]').forEach(input => {
                const paramName = input.dataset.param;
                const value = input.value.trim();
                if (value) {
                    if (endpoint.includes(`{${paramName}}`)) {
                        endpoint = endpoint.replace(`{${paramName}}`, encodeURIComponent(value));
                        hasPathParams = true;
                    } else {
                        queryParams.set(paramName, value);
                    }
                }
            });

            // Handle request body
            const bodyInput = container.querySelector('.body-input');
            if (bodyInput) {
                try {
                    // Test if JSON is valid before sending
                    JSON.parse(bodyInput.value);
                    options.body = bodyInput.value;
                    options.headers.set('Content-Type', 'application/json');
                } catch (e) {
                    responseContainer.innerHTML = `<pre><code>Error: Invalid JSON in request body.</code></pre>`;
                    responseContainer.className = 'response-container visible';
                    return;
                }
            }
            
            const url = `https://api.websim.dev/v1${endpoint}?${queryParams.toString()}`;

            button.textContent = 'Loading...';
            button.disabled = true;

            try {
                const response = await fetch(url, options);
                const status = response.status;
                const statusText = response.statusText;
                let responseBody = await response.text();

                let formattedBody = '';
                if(response.headers.get('Content-Type')?.includes('application/json') && responseBody) {
                    try {
                        formattedBody = JSON.stringify(JSON.parse(responseBody), null, 2);
                    } catch (e) {
                        formattedBody = responseBody; // Not valid JSON
                    }
                } else {
                    formattedBody = responseBody;
                }
                
                const statusClass = `status-${String(status)[0]}xx`;
                responseContainer.innerHTML = `
                    <h5>Response</h5>
                    <div class="status ${statusClass}">Status: ${status} ${statusText}</div>
                    <pre><code>${formattedBody || 'No content'}</code></pre>
                `;

            } catch (error) {
                 responseContainer.innerHTML = `<pre><code>Network Error: ${error.message}</code></pre>`;
            } finally {
                responseContainer.className = 'response-container visible';
                button.textContent = 'Execute';
                button.disabled = false;
            }
        });
    });
});