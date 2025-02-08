const pcap = require('pcap');
const geoip = require('geoip-lite');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
const showLocalIPs = process.env.SHOW_LOCAL_IPS === 'true';  // Add this line
const { isPromise } = require('util/types');
const dns = require('dns').promises;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static('public'));

// Store active connections
let activeConnections = new Map();

// Function to check if an IP address is private
function isPrivateIP(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    const firstOctet = parseInt(parts[0]);
    const secondOctet = parseInt(parts[1]);
    
    return (
        firstOctet === 10 || // 10.0.0.0/8
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) || // 172.16.0.0/12
        (firstOctet === 192 && secondOctet === 168) // 192.168.0.0/16
    );
}

// Calculate bandwidth percentages
function getBandwidthColor(bytesPerSec, maxBandwidth = 1000000) { // 1Mbps default max
    const percentage = (bytesPerSec / maxBandwidth) * 100;
    console.log(bytesPerSec, ' | ', percentage);
    // if (percentage <= 0.5) return 'WhiteSmoke';
    // if (percentage <= 5) return 'Gainsboro';
    // if (percentage <= 10) return 'lightgray';
    // if (percentage <= 20) return 'yellow';
    // if (percentage <= 40) return 'green';
    // if (percentage <= 60) return 'blue';
    // if (percentage <= 80) return 'orange';

    // if (bytesPerSec <= 50) return 'WhiteSmoke';
    // if (bytesPerSec <= 300) return 'Gainsboro';
    // if (bytesPerSec <= 1000) return 'lightgray';
    // if (bytesPerSec <= 3000) return 'yellow';
    // if (bytesPerSec <= 5000) return 'green';
    // if (bytesPerSec <= 10000) return 'royalblue';
    // if (percentage <= 80) return 'orange';

    if (bytesPerSec <= 50) return 'WhiteSmoke';
    if (bytesPerSec <= 300) return '#BCD2E8';
    if (bytesPerSec <= 1000) return '#91BAD6';
    if (bytesPerSec <= 3000) return '#73A5C6';
    if (bytesPerSec <= 5000) return '#528AAE';
    if (bytesPerSec <= 10000) return '#2E5984';
    if (bytesPerSec > 10000) return '#1E3F66';
    return '#1E3F66';
}
// Function to update connection information
function updateConnection(ip, country, bytes) {
    if (!activeConnections.has(ip)) {
        activeConnections.set(ip, {
            country,
            bytes: 0,
            lastSeen: Date.now()
        });
    }
    
    const conn = activeConnections.get(ip);
    conn.bytes += bytes;
    conn.lastSeen = Date.now();
}

// Start packet capture
try {
    const pcapSession = pcap.createSession('en0', { filter: 'ip' });
    console.log('Successfully created pcap session on en0 interface');

    pcapSession.on('packet', function (raw_packet) {
        try {
            const packet = pcap.decode.packet(raw_packet);
            if (packet.payload && packet.payload.payload) {
                const ip = packet.payload.payload;
                if (ip.saddr && ip.daddr && packet.pcap_header) {
                    const sourceIP = ip.saddr.toString();
                    const destIP = ip.daddr.toString();
                    
                    // Skip private IP addresses unless enabled in environment
                    const isPrivate = isPrivateIP(sourceIP);
                    if (isPrivate && !showLocalIPs) {
                        return;
                    }
                    
                    const geo = geoip.lookup(sourceIP);
                    const country = geo ? geo.country : 'Unknown';
                    const bytes = packet.pcap_header.len || 0;

                    // console.log(`Packet detected: ${sourceIP} -> ${destIP}, bytes: ${bytes}`);

                    // Update connection for source IP
                    updateConnection(sourceIP, country, bytes);
                }
            }
        } catch (error) {
            console.error('Error processing packet:', error.message);
        }
    });

    // Clean up inactive connections and emit updates every second
    setInterval(() => {
            const now = Date.now();
            const updates = [];
            
            activeConnections.forEach((conn, ip) => {
                if (now - conn.lastSeen > 5000) { // Remove after 5 seconds of inactivity
                    activeConnections.delete(ip);
                } else {
                    updates.push({
                        ip,
                        domain: ip, // Use IP address as domain
                        country: `${conn.country} (${(conn.bytes/1024).toFixed(2)}KB/s)`, // Convert bytes to KB
                        bytesPerSec: conn.bytes,
                        color: getBandwidthColor(conn.bytes)
                    });
                    conn.bytes = 0; // Reset bytes for next interval
                }
            });
            
            io.emit('trafficUpdate', updates);
        }, 1000);

    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

} catch (error) {
    console.error('Error creating pcap session:', error.message);
    console.log('Note: This application requires root privileges to capture network traffic.');
    process.exit(1);
}