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

// Store portfolio beta
let portfolioBeta = null;

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
 * Weight flexibility: ±10% from user selection, minimum 1% if user selected any weight
 */
async function optimizePortfolio() {
    // Validate weights
    const totalWeight = Object.values(currentWeights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
        showStatus('Weights must equal 100%', 'error');
        return;
    }

    // Get parameters
    const nominalExposure = getNominalExposure();
    const targetDTE = parseInt(document.getElementById('target-dte').value) || 30;
    const targetOTM = parseFloat(document.getElementById('otm-target').value) || 10;

    // Show loading
    showStatus('Fetching option data...', 'loading');
    const optimizeBtn = document.querySelector('.optimize-btn');
    optimizeBtn.disabled = true;

    optimizationResults = [];

    try {
        // Step 1: Get yield data for all ETFs with non-zero user weight
        const etfYieldData = [];

        for (const etf of Object.keys(currentWeights)) {
            if (currentWeights[etf] <= 0) continue;

            try {
                showStatus(`Analyzing ${etf}...`, 'loading');
                const optionData = await findBestOptionData(etf, targetDTE, targetOTM);
                if (optionData) {
                    etfYieldData.push({
                        etf,
                        userWeight: currentWeights[etf],
                        ...optionData
                    });
                }
            } catch (error) {
                console.error(`Error processing ${etf}:`, error);
            }
        }

        if (etfYieldData.length === 0) {
            showStatus('No options found matching criteria', 'error');
            optimizeBtn.disabled = false;
            return;
        }

        // Step 2: Optimize weights to maximize yield
        showStatus('Optimizing weights...', 'loading');
        const optimizedWeights = optimizeWeights(etfYieldData);

        // Step 3: Calculate final allocations with optimized weights
        for (const data of etfYieldData) {
            const optimizedWeight = optimizedWeights[data.etf];
            const allocation = (optimizedWeight / 100) * nominalExposure;

            const notionalPerContract = data.strike * 100;
            const contracts = Math.floor(allocation / notionalPerContract);

            if (contracts < 1) {
                console.log(`${data.etf}: Skipped - less than 1 contract`);
                continue;
            }

            const totalNotional = contracts * notionalPerContract;
            const totalPremium = contracts * data.bid * 100;

            console.log(`${data.etf}: ${contracts} contracts, bid=$${data.bid}, premium=$${totalPremium.toFixed(2)}`);

            // Skip ETFs where premium is less than $1000 (overrides 1% min allocation)
            if (totalPremium < 1000) {
                console.log(`${data.etf}: Skipped - premium $${totalPremium.toFixed(2)} < $1000`);
                continue;
            }

            optimizationResults.push({
                etf: data.etf,
                weight: optimizedWeight,
                userWeight: data.userWeight,
                stockPrice: data.stockPrice,
                strike: data.strike,
                expiration: data.expiration,
                dte: data.dte,
                bid: data.bid,
                ask: data.ask,
                mid: (data.bid + data.ask) / 2,
                volume: data.volume,
                openInterest: data.openInterest,
                contracts,
                premium: totalPremium,
                notional: totalNotional,
                annualizedYield: data.annualizedYield,
                actualOTM: data.actualOTM,
                optionSymbol: data.optionSymbol
            });
        }

        if (optimizationResults.length === 0) {
            showStatus('No valid trades found (allocations too small)', 'error');
            optimizeBtn.disabled = false;
            return;
        }

        // Step 4: Calculate portfolio beta
        showStatus('Calculating portfolio beta...', 'loading');
        portfolioBeta = await calculatePortfolioBeta(optimizedWeights);

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
 * Optimize weights to maximize portfolio yield
 * Constraints: ±10% from user weight, minimum 1% for any selected ETF
 */
function optimizeWeights(etfYieldData) {
    // Calculate weight bounds for each ETF
    const bounds = {};
    for (const data of etfYieldData) {
        const userWeight = data.userWeight;
        // Min: at least 1% if user selected any weight, or userWeight - 10 (whichever is higher)
        const minWeight = Math.max(1, userWeight - 10);
        // Max: userWeight + 10, but not more than 100
        const maxWeight = Math.min(100, userWeight + 10);
        bounds[data.etf] = { min: minWeight, max: maxWeight, yield: data.annualizedYield };
    }

    // Start with minimum weights
    const optimizedWeights = {};
    let totalAllocated = 0;

    for (const data of etfYieldData) {
        optimizedWeights[data.etf] = bounds[data.etf].min;
        totalAllocated += bounds[data.etf].min;
    }

    // Calculate remaining weight to distribute
    let remaining = 100 - totalAllocated;

    // Sort ETFs by yield (highest first)
    const sortedETFs = [...etfYieldData].sort((a, b) => b.annualizedYield - a.annualizedYield);

    // Distribute remaining weight to highest yielding ETFs first
    for (const data of sortedETFs) {
        if (remaining <= 0) break;

        const etf = data.etf;
        const currentWeight = optimizedWeights[etf];
        const maxWeight = bounds[etf].max;
        const canAdd = maxWeight - currentWeight;

        if (canAdd > 0) {
            const toAdd = Math.min(canAdd, remaining);
            optimizedWeights[etf] += toAdd;
            remaining -= toAdd;
        }
    }

    // If still remaining (shouldn't happen if bounds are valid), distribute evenly
    if (remaining > 0.1) {
        const perETF = remaining / etfYieldData.length;
        for (const data of etfYieldData) {
            optimizedWeights[data.etf] += perETF;
        }
    }

    // Round to 1 decimal place
    for (const etf of Object.keys(optimizedWeights)) {
        optimizedWeights[etf] = Math.round(optimizedWeights[etf] * 10) / 10;
    }

    return optimizedWeights;
}

/**
 * Find the best option data for an ETF (without calculating contracts)
 * Returns yield and option details for weight optimization
 */
async function findBestOptionData(etf, targetDTE, targetOTM) {
    // Get stock price
    const stockData = await fetchStockQuote(etf);
    if (!stockData || !stockData.price) return null;

    // Get all expirations
    const expirations = await fetchExpirations(etf);
    if (!expirations || expirations.length === 0) return null;

    // Define DTE range: 20 days shorter to 35 days longer than target
    const minDTE = Math.max(1, targetDTE - 20);
    const maxDTE = targetDTE + 35;

    // Check if monthly-only filter is enabled
    const monthlyOnly = document.getElementById('monthly-only')?.checked || false;

    // Filter expirations within the allowed range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const validExpirations = expirations.filter(exp => {
        const expDate = new Date(exp + 'T00:00:00');
        const dte = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

        // Check DTE range
        if (dte < minDTE || dte > maxDTE) return false;

        // If monthly-only is checked, only include third Friday expirations
        if (monthlyOnly && !isThirdFriday(exp)) return false;

        return true;
    });

    if (validExpirations.length === 0) return null;

    // Calculate target strike (OTM put)
    const targetStrike = stockData.price * (1 - targetOTM / 100);

    // Track best option across all valid expirations
    let bestResult = null;
    let bestYield = -Infinity;

    // Search all valid expirations for the highest yielding option
    for (const expiration of validExpirations) {
        const chain = await fetchOptionChain(etf, expiration, 'put');
        if (!chain || chain.length === 0) continue;

        // Find closest strike to target OTM
        let closestOption = null;
        let closestDiff = Infinity;

        for (const option of chain) {
            const diff = Math.abs(option.strike - targetStrike);
            if (diff < closestDiff && option.bid >= 0.50) {
                closestDiff = diff;
                closestOption = option;
            }
        }

        if (!closestOption) continue;

        // Calculate metrics for this option
        const dte = calculateDaysToExpiry(expiration);
        const periodYield = closestOption.bid / stockData.price;
        const annualizedYield = periodYield * (365 / dte);

        // Keep track of the highest yielding option
        if (annualizedYield > bestYield) {
            bestYield = annualizedYield;
            const actualOTM = ((stockData.price - closestOption.strike) / stockData.price) * 100;

            bestResult = {
                stockPrice: stockData.price,
                strike: closestOption.strike,
                expiration,
                dte,
                bid: closestOption.bid,
                ask: closestOption.ask,
                volume: closestOption.volume,
                openInterest: closestOption.openInterest,
                annualizedYield,
                actualOTM,
                optionSymbol: closestOption.symbol
            };
        }
    }

    return bestResult;
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
            ask: data.ask?.[i] || 0,
            volume: data.volume?.[i] || 0,
            openInterest: data.openInterest?.[i] || 0
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
 * Check if a date is the third Friday of its month
 */
function isThirdFriday(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');

    // Check if it's a Friday (day 5)
    if (date.getDay() !== 5) return false;

    // Get the day of the month
    const dayOfMonth = date.getDate();

    // Third Friday falls between the 15th and 21st
    return dayOfMonth >= 15 && dayOfMonth <= 21;
}

/**
 * Fetch historical candle data for a ticker
 * Returns array of closing prices (oldest to newest)
 */
async function fetchHistoricalPrices(ticker, days = 90) {
    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];

    const url = `${MARKETDATA_API.baseUrl}/stocks/candles/D/${ticker}/?from=${fromStr}&to=${toStr}`;
    console.log(`Fetching historical data: ${url}`);

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Token ${MARKETDATA_API.token}` }
        });

        if (!response.ok) {
            console.error(`Historical data API error for ${ticker}: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`Response: ${text}`);
            return null;
        }

        const data = await response.json();
        console.log(`Historical data for ${ticker}:`, data.s, data.c ? data.c.length + ' prices' : 'no data');

        if (data.s !== 'ok' || !data.c || data.c.length === 0) {
            console.error(`Invalid data for ${ticker}:`, data);
            return null;
        }

        // Return closing prices
        return data.c;
    } catch (error) {
        console.error(`Error fetching historical data for ${ticker}:`, error);
        return null;
    }
}

/**
 * Calculate daily returns from prices
 * Returns array of returns (percentage change)
 */
function calculateReturns(prices) {
    if (!prices || prices.length < 2) return [];

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
        returns.push(dailyReturn);
    }
    return returns;
}

/**
 * Calculate covariance between two arrays
 */
function calculateCovariance(arr1, arr2) {
    if (arr1.length !== arr2.length || arr1.length === 0) return 0;

    const n = arr1.length;
    const mean1 = arr1.reduce((sum, x) => sum + x, 0) / n;
    const mean2 = arr2.reduce((sum, x) => sum + x, 0) / n;

    let covariance = 0;
    for (let i = 0; i < n; i++) {
        covariance += (arr1[i] - mean1) * (arr2[i] - mean2);
    }

    return covariance / (n - 1); // Sample covariance
}

/**
 * Calculate variance of an array
 */
function calculateVariance(arr) {
    if (arr.length === 0) return 0;

    const n = arr.length;
    const mean = arr.reduce((sum, x) => sum + x, 0) / n;

    let variance = 0;
    for (let i = 0; i < n; i++) {
        variance += Math.pow(arr[i] - mean, 2);
    }

    return variance / (n - 1); // Sample variance
}

/**
 * Calculate portfolio beta to S&P 500
 * β_p = Cov(R_p, R_m) / Var(R_m)
 */
async function calculatePortfolioBeta(optimizedWeights) {
    try {
        console.log('Starting beta calculation...');
        console.log('Optimized weights:', optimizedWeights);

        // Fetch SPY (market) historical prices
        const spyPrices = await fetchHistoricalPrices('SPY', 90);
        if (!spyPrices || spyPrices.length < 10) {
            console.error('Could not fetch SPY historical data');
            return null;
        }
        console.log(`SPY prices fetched: ${spyPrices.length} data points`);

        const marketReturns = calculateReturns(spyPrices);
        if (marketReturns.length === 0) {
            console.error('No market returns calculated');
            return null;
        }
        console.log(`Market returns calculated: ${marketReturns.length} returns`);

        // Fetch historical prices for each ETF in the portfolio
        const etfReturnsMap = {};
        const activeETFs = Object.keys(optimizedWeights).filter(etf => optimizedWeights[etf] > 0);
        console.log('Active ETFs:', activeETFs);

        for (const etf of activeETFs) {
            // Skip SPY since it's the benchmark
            if (etf === 'SPY') {
                etfReturnsMap[etf] = marketReturns;
                console.log(`${etf}: using market returns (benchmark)`);
                continue;
            }

            const prices = await fetchHistoricalPrices(etf, 90);
            if (prices && prices.length >= 10) {
                etfReturnsMap[etf] = calculateReturns(prices);
                console.log(`${etf}: ${etfReturnsMap[etf].length} returns calculated`);
            } else {
                console.log(`${etf}: insufficient data, skipping`);
            }
        }

        // Check if we have any ETF data
        if (Object.keys(etfReturnsMap).length === 0) {
            console.error('No ETF return data available');
            return null;
        }

        // Find the minimum length across all return series (to align dates)
        let minLength = marketReturns.length;
        for (const etf of Object.keys(etfReturnsMap)) {
            minLength = Math.min(minLength, etfReturnsMap[etf].length);
        }
        console.log(`Using ${minLength} aligned data points`);

        if (minLength < 5) {
            console.error('Insufficient aligned data points');
            return null;
        }

        // Trim all return series to the same length (most recent data)
        const trimmedMarketReturns = marketReturns.slice(-minLength);

        // Calculate weighted portfolio returns
        const portfolioReturns = [];
        for (let i = 0; i < minLength; i++) {
            let dayReturn = 0;
            let totalWeight = 0;

            for (const etf of Object.keys(etfReturnsMap)) {
                const weight = optimizedWeights[etf] / 100;
                const etfReturns = etfReturnsMap[etf].slice(-minLength);
                dayReturn += weight * etfReturns[i];
                totalWeight += weight;
            }

            // Normalize by total weight (in case some ETFs were missing)
            if (totalWeight > 0) {
                portfolioReturns.push(dayReturn / totalWeight);
            }
        }

        if (portfolioReturns.length < 5) {
            console.error('Insufficient portfolio returns');
            return null;
        }

        // Calculate beta: Cov(R_p, R_m) / Var(R_m)
        const covariance = calculateCovariance(portfolioReturns, trimmedMarketReturns);
        const marketVariance = calculateVariance(trimmedMarketReturns);

        console.log(`Covariance: ${covariance}, Market Variance: ${marketVariance}`);

        if (marketVariance === 0) {
            console.error('Market variance is zero');
            return null;
        }

        const beta = covariance / marketVariance;
        console.log(`Calculated portfolio beta: ${beta.toFixed(4)}`);
        return beta;

    } catch (error) {
        console.error('Error calculating portfolio beta:', error);
        return null;
    }
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

    // Update portfolio beta
    const betaEl = document.getElementById('portfolio-beta');
    if (betaEl) {
        if (portfolioBeta !== null) {
            betaEl.textContent = portfolioBeta.toFixed(2);
        } else {
            betaEl.textContent = 'N/A';
        }
    }

    // Build trades table
    const tbody = document.getElementById('trades-body');
    tbody.innerHTML = optimizationResults.map(r => {
        const weightDiff = r.weight - r.userWeight;
        const weightDisplay = weightDiff !== 0
            ? `${r.weight}% <span class="weight-diff">(${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)})</span>`
            : `${r.weight}%`;
        return `
        <tr>
            <td class="etf">${r.etf}</td>
            <td>${weightDisplay}</td>
            <td>$${r.strike.toFixed(2)}</td>
            <td>${formatDate(r.expiration)}</td>
            <td>${r.dte}</td>
            <td>$${r.bid.toFixed(2)}</td>
            <td>$${r.ask.toFixed(2)}</td>
            <td>$${r.mid.toFixed(2)}</td>
            <td>${r.openInterest.toLocaleString()}</td>
            <td>${r.volume.toLocaleString()}</td>
            <td class="contracts">${r.contracts}</td>
            <td>${formatCurrency(r.premium)}</td>
            <td>${formatCurrency(r.notional)}</td>
            <td class="yield">${(r.annualizedYield * 100).toFixed(1)}%</td>
        </tr>
    `}).join('');

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

    const nominalExposure = getNominalExposure();
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
Portfolio Beta:      ${portfolioBeta !== null ? portfolioBeta.toFixed(2) : 'N/A'}

═══════════════════════════════════════════════════════════════
                         TRADE DETAILS
═══════════════════════════════════════════════════════════════

`;

    optimizationResults.forEach((r, idx) => {
        const weightDiff = r.weight - r.userWeight;
        const weightNote = weightDiff !== 0
            ? ` (optimized from ${r.userWeight}%, ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)}%)`
            : '';
        const limitPremium = r.contracts * r.mid * 100;
        orderText += `
Trade ${idx + 1}: ${r.etf}
─────────────────────────────────────────────────────────────────
Action:          SELL TO OPEN (LIMIT ORDER)
Symbol:          ${r.etf}
Type:            PUT
Strike:          $${r.strike.toFixed(2)}
Expiration:      ${formatDate(r.expiration)} (${r.dte} days)
Contracts:       ${r.contracts}
Limit Price:     $${r.mid.toFixed(2)} (midpoint)
─────────────────────────────────────────────────────────────────
Bid:             $${r.bid.toFixed(2)}
Ask:             $${r.ask.toFixed(2)}
Open Interest:   ${r.openInterest.toLocaleString()}
Volume Today:    ${r.volume.toLocaleString()}
─────────────────────────────────────────────────────────────────
Est. Premium:    ${formatCurrency(limitPremium)} (at limit)
Notional:        ${formatCurrency(r.notional)}
Ann. Yield:      ${(r.annualizedYield * 100).toFixed(2)}%
OCC Symbol:      ${r.optionSymbol || 'N/A'}
Weight:          ${r.weight}%${weightNote}

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

/**
 * Format exposure input with commas
 */
function formatExposureInput(input) {
    // Remove non-numeric characters except decimal
    let value = input.value.replace(/[^0-9.]/g, '');

    // Parse as number
    let num = parseFloat(value);
    if (isNaN(num)) {
        input.value = '';
        return;
    }

    // Format with commas
    input.value = num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

/**
 * Get nominal exposure value (removes commas)
 */
function getNominalExposure() {
    const input = document.getElementById('nominal-exposure');
    const value = input.value.replace(/,/g, '');
    return parseFloat(value) || 1000000;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
