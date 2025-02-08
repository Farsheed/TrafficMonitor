const CDP = require('chrome-remote-interface');

(async function() {
    try {
        // List all available targets (tabs)
        const targets = await CDP.List();
        const pageTargets = targets.filter(t => t.type === 'page');
        console.log(`Found ${pageTargets.length} page(s):`);
        pageTargets.forEach(t => console.log(`- [${t.id}] ${t.title}`));

        // Attach to each page target and enable network monitoring
        pageTargets.forEach(target => {
            CDP({target}, async (client) => {
                const {Network, Page} = client;
                await Network.enable();
                await Page.enable();
                console.log(`Attached to tab: ${target.title || target.id}`);
                
                // Listen for network responses to get the destination IP
                Network.responseReceived(params => {
                    const {response} = params;
                    if (response.remoteIPAddress) {
                        console.log(`[${target.title || target.id}] ${response.url} -> ${response.remoteIPAddress}`);
                    }
                });
            }).on('error', err => {
                console.error(`Error connecting to target ${target.id}: ${err}`);
            });
        });
    } catch (err) {
        console.error(`Error: ${err}`);
    }
})();
