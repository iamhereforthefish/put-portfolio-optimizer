/**
 * Put Portfolio Optimizer
 * Optimizes put-selling portfolio across major ETFs for maximum yield
 */

// MarketData.app API configuration
const MARKETDATA_API = {
    baseUrl: 'https://api.marketdata.app/v1',
    token: 'X0htSHRqcThNTGJuOUVOb1YxQVRMcGN3cl9XdTd2Y3lrV2ZWN2wzc2FQMD0'
};

// ETF Universe with default weights
const ETF_DATA = {
    'SPY': { name: 'S&P 500 ETF', weight: 20 },
    'QQQ': { name: 'Nasdaq-100 ETF', weight: 15 },
    'IWM': { name: 'Russell 2000 ETF', weight: 10 },
    'EFA': { name: 'EAFE International', weight: 10 },
    'EEM': { name: 'Emerging Markets', weight: 10 },
    'GLD': { name: 'Gold ETF', weight: 10 },
    'SLV': { name: 'Silver ETF', weight: 10 },
    'GDX': { name: 'Gold Miners ETF', weight: 10 },
    'IBIT': { name: 'Bitcoin ETF', weight: 5 }
};

// Store current weights
let currentWeights = {};

// Store optimization results
let optimizationResults = [];

/**
 * Initialize the application
 */
function init() {
    // Check if running from file:// protocol
    if (window.location.protocol === 'file:') {
        alert('Please run this app via a local server. Double-click start-server.bat');
        return;
    }

    // Initialize weights from defaults
    Object.keys(ETF_DATA).forEach(etf => {
        currentWeights[etf] = ETF_DATA[etf].weight;
    });

    // Build weights UI
    buildWeightsGrid();
    updateTotalWeight();
}

/**
 * Build the weights grid UI
 */
function buildWeightsGrid() {
    const grid = document.getElementById('weights-grid');
    grid.innerHTML = '';

    Object.keys(ETF_DATA).forEach(etf => {
        const card = document.createElement('div');
        card.className = 'weight-card';
        card.innerHTML = `
            <div class="weight-card-header">
                <span class="etf-symbol">${etf}</span>
            </div>
            <span class="etf-name">${ETF_DATA[etf].name}</span>
            <div class="weight-input-group">
                <input type="number"
                       id="weight-${etf}"
                       value="${currentWeights[etf]}"
                       min="0"
                       max="100"
                       step="1"
                       onchange="updateWeight('${etf}', this.value)"
                       oninput="updateWeight('${etf}', this.value)">
                <span>%</span>
            </div>
            <input type="range"
                   class="weight-slider"
                   id="slider-${etf}"
                   value="${currentWeights[etf]}"
                   min="0"
                   max="100"
                   step="1"
                   onchange="updateWeightFromSlider('${etf}', this.value)"
                   oninput="updateWeightFromSlider('${etf}', this.value)">
        `;
        grid.appendChild(card);
    });
}

/**
 * Update weight from input
 */
function updateWeight(etf, value) {
    currentWeights[etf] = parseFloat(value) || 0;
    document.getElementById(`slider-${etf}`).value = currentWeights[etf];
    updateTotalWeight();
}

/**
 * Update weight from slider
 */
function updateWeightFromSlider(etf, value) {
    currentWeights[etf] = parseFloat(value) || 0;
    document.getElementById(`weight-${etf}`).value = currentWeights[etf];
    updateTotalWeight();
}

/**
 * Update total weight display
 */
function updateTotalWeight() {
    const total = Object.values(currentWeights).reduce((sum, w) => sum + w, 0);
    const totalEl = document.getElementById('total-weight');
    totalEl.textContent = `${total.toFixed(1)}%`;

    if (Math.abs(total - 100) < 0.1) {
        totalEl.className = 'total-value valid';
    } else {
        totalEl.className = 'total-value invalid';
    }
}

/**
 * Equalize all weights
 */
function equalizeWeights() {
    const numETFs = Object.keys(ETF_DATA).length;
    const equalWeight = Math.floor(100 / numETFs);
    const remainder = 100 - (equalWeight * numETFs);

    let idx = 0;
    Object.keys(ETF_DATA).forEach(etf => {
        currentWeights[etf] = equalWeight + (idx < remainder ? 1 : 0);
        document.getElementById(`weight-${etf}`).value = currentWeights[etf];
        document.getElementById(`slider-${etf}`).value = currentWeights[etf];
        idx++;
    });

    updateTotalWeight();
}

/**
 * Reset weights to defaults
 */
function resetWeights() {
    Object.keys(ETF_DATA).forEach(etf => {
        currentWeights[etf] = ETF_DATA[etf].weight;
        document.getElementById(`weight-${etf}`).value = currentWeights[etf];
        document.getElementById(`slider-${etf}`).value = currentWeights[etf];
    });

    updateTotalWeight();
}

/**
 * Optimize the portfolio
 */
async function optimizePortfolio() {
    // Validate weights
    const totalWeight = Object.values(currentWeights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
        showStatus('Weights must equal 100%', 'error');
        return;
    }

    // Get parameters
    const nominalExposure = parseFloat(document.getElementById('nominal-exposure').value) || 100000;
    const targetDTE = parseInt(document.getElementById('target-dte').value) || 30;
    const targetOTM = parseFloat(document.getElementById('otm-target').value) || 10;

    // Show loading
    showStatus('Optimizing portfolio...', 'loading');
    const optimizeBtn = document.querySelector('.optimize-btn');
    optimizeBtn.disabled = true;

    optimizationResults = [];

    try {
        // Process each ETF with non-zero weight
        for (const etf of Object.keys(currentWeights)) {
            if (currentWeights[etf] <= 0) continue;

            const allocation = (currentWeights[etf] / 100) * nominalExposure;

            try {
                const result = await findBestPut(etf, allocation, targetDTE, targetOTM);
                if (result) {
                    optimizationResults.push(result);
                }
            } catch (error) {
                console.error(`Error processing ${etf}:`, error);
            }
        }

        if (optimizationResults.length === 0) {
            showStatus('No options found matching criteria', 'error');
            optimizeBtn.disabled = false;
            return;
        }

        // Display results
        displayResults(nominalExposure, targetDTE, targetOTM);
        showStatus('Optimization complete!', 'success');

    } catch (error) {
        console.error('Optimization error:', error);
        showStatus('Optimization failed: ' + error.message, 'error');
    }

    optimizeBtn.disabled = false;
}

/**
 * Find the best put option for an ETF
 */
async function findBestPut(etf, allocation, targetDTE, targetOTM) {
    // Get stock price
    const stockData = await fetchStockQuote(etf);
    if (!stockData || !stockData.price) return null;

    // Find expiration closest to target DTE
    const expirations = await fetchExpirations(etf);
    if (!expirations || expirations.length === 0) return null;

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + targetDTE);

    let bestExpiration = expirations[0];
    let bestDiff = Infinity;

    for (const exp of expirations) {
        const expDate = new Date(exp + 'T00:00:00');
        const diff = Math.abs(expDate - targetDate);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestExpiration = exp;
        }
    }

    // Calculate target strike (OTM put)
    const targetStrike = stockData.price * (1 - targetOTM / 100);

    // Get option chain
    const chain = await fetchOptionChain(etf, bestExpiration, 'put');
    if (!chain || chain.length === 0) return null;

    // Find closest strike to target
    let bestOption = null;
    let closestDiff = Infinity;

    for (const option of chain) {
        const diff = Math.abs(option.strike - targetStrike);
        if (diff < closestDiff && option.bid > 0.05) {
            closestDiff = diff;
            bestOption = option;
        }
    }

    if (!bestOption) return null;

    // Calculate contracts and metrics
    const dte = calculateDaysToExpiry(bestExpiration);
    const notionalPerContract = bestOption.strike * 100;
    const contracts = Math.floor(allocation / notionalPerContract);

    if (contracts < 1) return null;

    const totalNotional = contracts * notionalPerContract;
    const totalPremium = contracts * bestOption.bid * 100;
    const periodYield = bestOption.bid / stockData.price;
    const annualizedYield = periodYield * (365 / dte);
    const actualOTM = ((stockData.price - bestOption.strike) / stockData.price) * 100;

    return {
        etf,
        weight: currentWeights[etf],
        stockPrice: stockData.price,
        strike: bestOption.strike,
        expiration: bestExpiration,
        dte,
        bid: bestOption.bid,
        ask: bestOption.ask,
        contracts,
        premium: totalPremium,
        notional: totalNotional,
        annualizedYield,
        actualOTM,
        optionSymbol: bestOption.symbol
    };
}

/**
 * Fetch stock quote
 */
async function fetchStockQuote(ticker) {
    const response = await fetch(`${MARKETDATA_API.baseUrl}/stocks/quotes/${ticker}/`, {
        headers: { 'Authorization': `Token ${MARKETDATA_API.token}` }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.s !== 'ok') return null;

    const price = data.last?.[0] || data.mid?.[0] || ((data.bid?.[0] + data.ask?.[0]) / 2);
    return { price };
}

/**
 * Fetch expiration dates
 */
async function fetchExpirations(ticker) {
    const response = await fetch(`${MARKETDATA_API.baseUrl}/options/expirations/${ticker}/`, {
        headers: { 'Authorization': `Token ${MARKETDATA_API.token}` }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.s !== 'ok' || !data.expirations) return null;

    return data.expirations;
}

/**
 * Fetch option chain
 */
async function fetchOptionChain(ticker, expiration, side) {
    const url = `${MARKETDATA_API.baseUrl}/options/chain/${ticker}/?expiration=${expiration}&side=${side}`;

    const response = await fetch(url, {
        headers: { 'Authorization': `Token ${MARKETDATA_API.token}` }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.s !== 'ok' || !data.strike) return null;

    const options = [];
    for (let i = 0; i < data.strike.length; i++) {
        options.push({
            symbol: data.optionSymbol?.[i],
            strike: data.strike[i],
            bid: data.bid?.[i] || 0,
            ask: data.ask?.[i] || 0
        });
    }

    return options;
}

/**
 * Calculate days to expiry
 */
function calculateDaysToExpiry(expirationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expirationDate + 'T00:00:00');
    const diffTime = expiry - today;
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Display optimization results
 */
function displayResults(nominalExposure, targetDTE, targetOTM) {
    const resultsSection = document.getElementById('results-section');
    resultsSection.style.display = 'block';

    // Update subtitle
    document.getElementById('result-exposure').textContent = formatCurrency(nominalExposure);
    document.getElementById('result-dte').textContent = targetDTE;
    document.getElementById('result-otm').textContent = targetOTM + '%';

    // Calculate totals
    const totalPremium = optimizationResults.reduce((sum, r) => sum + r.premium, 0);
    const totalNotional = optimizationResults.reduce((sum, r) => sum + r.notional, 0);
    const avgDTE = optimizationResults.reduce((sum, r) => sum + r.dte * r.notional, 0) / totalNotional;

    // Weighted average yield
    const portfolioYield = optimizationResults.reduce((sum, r) =>
        sum + r.annualizedYield * (r.notional / totalNotional), 0);

    // Update summary cards
    document.getElementById('portfolio-yield').textContent = (portfolioYield * 100).toFixed(1) + '%';
    document.getElementById('total-premium').textContent = formatCurrency(totalPremium);
    document.getElementById('total-notional').textContent = formatCurrency(totalNotional);
    document.getElementById('avg-dte').textContent = Math.round(avgDTE) + ' days';

    // Build trades table
    const tbody = document.getElementById('trades-body');
    tbody.innerHTML = optimizationResults.map(r => `
        <tr>
            <td class="etf">${r.etf}</td>
            <td>${r.weight}%</td>
            <td>$${r.strike.toFixed(2)}</td>
            <td>${formatDate(r.expiration)}</td>
            <td>${r.dte}</td>
            <td>$${r.bid.toFixed(2)}</td>
            <td class="contracts">${r.contracts}</td>
            <td>${formatCurrency(r.premium)}</td>
            <td>${formatCurrency(r.notional)}</td>
            <td class="yield">${(r.annualizedYield * 100).toFixed(1)}%</td>
        </tr>
    `).join('');

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Copy trade order to clipboard
 */
function copyTradeOrder() {
    if (optimizationResults.length === 0) {
        showCopyStatus('No trades to copy', 'error');
        return;
    }

    const nominalExposure = document.getElementById('nominal-exposure').value;
    const targetDTE = document.getElementById('target-dte').value;
    const targetOTM = document.getElementById('otm-target').value;

    const totalPremium = optimizationResults.reduce((sum, r) => sum + r.premium, 0);
    const totalNotional = optimizationResults.reduce((sum, r) => sum + r.notional, 0);
    const portfolioYield = optimizationResults.reduce((sum, r) =>
        sum + r.annualizedYield * (r.notional / totalNotional), 0);

    let orderText = `
════════════════════════════════════════════════════════════════
                    PUT PORTFOLIO TRADE ORDER
════════════════════════════════════════════════════════════════

Portfolio Parameters:
─────────────────────────────────────────────────────────────────
Target Exposure:     ${formatCurrency(parseFloat(nominalExposure))}
Target Maturity:     ${targetDTE} days
Target OTM:          ${targetOTM}%

Portfolio Summary:
─────────────────────────────────────────────────────────────────
Annualized Yield:    ${(portfolioYield * 100).toFixed(2)}%
Total Premium:       ${formatCurrency(totalPremium)}
Total Notional:      ${formatCurrency(totalNotional)}

═══════════════════════════════════════════════════════════════
                         TRADE DETAILS
═══════════════════════════════════════════════════════════════

`;

    optimizationResults.forEach((r, idx) => {
        orderText += `
Trade ${idx + 1}: ${r.etf}
─────────────────────────────────────────────────────────────────
Action:          SELL TO OPEN
Symbol:          ${r.etf}
Type:            PUT
Strike:          $${r.strike.toFixed(2)}
Expiration:      ${formatDate(r.expiration)} (${r.dte} days)
Contracts:       ${r.contracts}
Bid Price:       $${r.bid.toFixed(2)}
─────────────────────────────────────────────────────────────────
Premium:         ${formatCurrency(r.premium)}
Notional:        ${formatCurrency(r.notional)}
Ann. Yield:      ${(r.annualizedYield * 100).toFixed(2)}%
OCC Symbol:      ${r.optionSymbol || 'N/A'}
Weight:          ${r.weight}%

`;
    });

    orderText += `
════════════════════════════════════════════════════════════════
                Generated by Put Portfolio Optimizer
                      ${new Date().toLocaleString()}
════════════════════════════════════════════════════════════════
`;

    navigator.clipboard.writeText(orderText.trim()).then(() => {
        showCopyStatus('Trade order copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Copy failed:', err);
        showCopyStatus('Failed to copy', 'error');
    });
}

/**
 * Show status message
 */
function showStatus(message, type) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
}

/**
 * Show copy status
 */
function showCopyStatus(message, type) {
    const statusEl = document.getElementById('copy-status');
    statusEl.textContent = message;
    statusEl.className = 'copy-status ' + type;

    setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'copy-status';
    }, 3000);
}

/**
 * Format currency
 */
function formatCurrency(value) {
    if (isNaN(value) || !isFinite(value)) return '--';
    return '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format date
 */
function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
