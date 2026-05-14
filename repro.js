const http = require('http');

async function chat(message, history) {
    const data = JSON.stringify({
        message,
        history,
        model: 'gpt-4o'
    });

    return new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3100/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    // Assuming the response is newline-delimited JSON or has a JSON block at the end
                    // We'll try to find the last valid JSON object in the stream
                    const lines = body.trim().split('\n');
                    let finalJson = null;
                    for (let i = lines.length - 1; i >= 0; i--) {
                        try {
                            const parsed = JSON.parse(lines[i]);
                            if (parsed.reply || parsed.llmMeta) {
                                finalJson = parsed;
                                break;
                            }
                        } catch (e) {}
                    }
                    resolve(finalJson || body);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function formatResult(res) {
    if (typeof res === 'string') return { error: 'Failed to parse JSON', raw: res.substring(0, 100) };
    return {
        reply: res.reply || 'N/A',
        modelPatchExists: !!res.modelPatch,
        stateIntent: res.llmMeta?.trace?.stateIntent,
        finalIntent: res.llmMeta?.trace?.finalIntent,
        responseDomain: res.llmMeta?.trace?.responseDomain,
        effectiveResponseDomain: res.llmMeta?.trace?.effectiveResponseDomain,
        patchSource: res.llmMeta?.trace?.patchSource
    };
}

async function run() {
    console.log('--- REPRO 1: Seed history with resource question/list ---');
    const h1 = [
        { role: 'assistant', content: 'What resources do you need help with?' },
        { role: 'user', content: 'The project budget and the timeline.' }
    ];
    const r1 = await chat('Can you summarize them?', h1);
    console.log(JSON.stringify(formatResult(r1), null, 2));

    console.log('\n--- REPRO 2: Three-turn flow (Impact -> Resources -> Activities) ---');
    const h2 = [];
    
    console.log('Turn 1: Impact');
    const r2_1 = await chat('What is the impact of the delay?', h2);
    console.log(JSON.stringify(formatResult(r2_1), null, 2));
    
    h2.push({ role: 'user', content: 'What is the impact of the delay?' });
    h2.push({ role: 'assistant', content: r2_1.reply });

    console.log('Turn 2: Resources');
    const r2_2 = await chat('What resources are affected?', h2);
    console.log(JSON.stringify(formatResult(r2_2), null, 2));

    h2.push({ role: 'user', content: 'What resources are affected?' });
    h2.push({ role: 'assistant', content: r2_2.reply });

    console.log('Turn 3: Activities');
    const r2_3 = await chat('What activities are next?', h2);
    console.log(JSON.stringify(formatResult(r2_3), null, 2));
}

run().catch(console.error);
