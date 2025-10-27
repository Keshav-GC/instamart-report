// --- Get HTML Elements ---
const fileInput = document.getElementById('fileInput');
const processButton = document.getElementById('processButton');
const status = document.getElementById('status');

let parsedData = null;

// --- Event Listeners ---
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        status.textContent = 'Parsing CSV file...';
        // Use PapaParse to read the CSV
        Papa.parse(file, {
            header: true, // Treat first row as headers
            skipEmptyLines: true,
            complete: (results) => {
                parsedData = results.data;
                status.textContent = `File loaded. ${parsedData.length} rows found. Ready to process.`;
                processButton.disabled = false;
            },
            error: (err) => {
                status.textContent = `Error: ${err.message}`;
                processButton.disabled = true;
            }
        });
    } else {
        status.textContent = 'Please select your CSV file.';
        processButton.disabled = true;
    }
});

processButton.addEventListener('click', () => {
    if (parsedData) {
        status.textContent = 'Processing data...';
        
        // Run the aggregation logic
        // Use setTimeout to allow the "Processing..." message to render
        setTimeout(() => {
            try {
                const finalData = aggregateData(parsedData);
                status.textContent = `Processing complete. ${finalData.length} aggregated rows generated.`;
                
                // Convert JavaScript object back to CSV string
                const csv = Papa.unparse(finalData);
                
                // Trigger download
                downloadCSV(csv, 'aggregated_brand_insights_v2.csv');
            } catch (err) {
                status.textContent = `An error occurred during processing: ${err.message}`;
            }
        }, 50); // 50ms delay
    }
});

// --- Main Aggregation Logic ---
function aggregateData(data) {
    // 1. Define Columns
    // These are the group-by columns (all columns except metrics and dropped ones)
    const group_by_cols = [
        'METRICS_DATE', 'CAMPAIGN_ID', 'CAMPAIGN_NAME', 
        'CAMPAIGN_START_DATE', 'CAMPAIGN_END_DATE', 'CAMPAIGN_STATUS', 
        'BIDDING_TYPE', 'AD_PROPERTY', 'KEYWORD', 'BRAND_NAME'
    ];
    
    // Map to hold aggregated data. Keys will be a composite string.
    const aggregations = new Map();

    for (const row of data) {
        // 2. Pre-processing and Grouping
        
        // **FIX**: Fill NaNs in group-by columns to prevent rows from being dropped
        // We create a unique key for the group
        const keyParts = group_by_cols.map(col => row[col] || 'Unknown');
        const compositeKey = keyParts.join('|'); // Use a delimiter

        // Get and clean metric values (convert to numbers, fill NaN with 0)
        const metrics = {
            eCPM: parseFloat(row.eCPM) || 0,
            eCPC: parseFloat(row.eCPC) || 0,
            TOTAL_IMPRESSIONS: parseInt(row.TOTAL_IMPRESSIONS) || 0,
            TOTAL_BUDGET: parseInt(row.TOTAL_BUDGET) || 0,
            TOTAL_BUDGET_BURNT: parseFloat(row.TOTAL_BUDGET_BURNT) || 0,
            TOTAL_CLICKS: parseInt(row.TOTAL_CLICKS) || 0,
            TOTAL_A2C: parseFloat(row.TOTAL_A2C) || 0,
            TOTAL_GMV: parseFloat(row.TOTAL_GMV) || 0,
            CONVERSIONS: parseInt(row.CONVERSIONS) || 0
        };

        // Get group-by fields to store in the output
        const groupByFields = {};
        group_by_cols.forEach((col, i) => {
            groupByFields[col] = keyParts[i];
        });

        // 3. Perform Aggregation
        if (!aggregations.has(compositeKey)) {
            // First time seeing this key, initialize the aggregation
            aggregations.set(compositeKey, {
                ...groupByFields, // Add all the group-by fields
                eCPM: metrics.eCPM, // For max
                eCPC: metrics.eCPC, // For max
                TOTAL_IMPRESSIONS: metrics.TOTAL_IMPRESSIONS, // For sum
                TOTAL_BUDGET: metrics.TOTAL_BUDGET, // For max
                TOTAL_BUDGET_BURNT: metrics.TOTAL_BUDGET_BURNT, // For sum
                TOTAL_CLICKS: metrics.TOTAL_CLICKS, // For sum
                TOTAL_A2C: metrics.TOTAL_A2C, // For sum
                TOTAL_GMV: metrics.TOTAL_GMV, // For sum
                CONVERSIONS: metrics.CONVERSIONS, // For sum
            });
        } else {
            // Key already exists, update the aggregation
            const agg = aggregations.get(compositeKey);
            agg.eCPM = Math.max(agg.eCPM, metrics.eCPM);
            agg.eCPC = Math.max(agg.eCPC, metrics.eCPC);
            agg.TOTAL_IMPRESSIONS += metrics.TOTAL_IMPRESSIONS;
            agg.TOTAL_BUDGET = Math.max(agg.TOTAL_BUDGET, metrics.TOTAL_BUDGET);
            agg.TOTAL_BUDGET_BURNT += metrics.TOTAL_BUDGET_BURNT;
            agg.TOTAL_CLICKS += metrics.TOTAL_CLICKS;
            agg.TOTAL_A2C += metrics.TOTAL_A2C;
            agg.TOTAL_GMV += metrics.TOTAL_GMV;
            agg.CONVERSIONS += metrics.CONVERSIONS;
        }
    }

    // Convert Map values back to an array
    const finalData = Array.from(aggregations.values());

    // 4. Calculate New Metrics
    for (const row of finalData) {
        // TOTAL_CTR (handle division by zero)
        row.TOTAL_CTR = row.TOTAL_IMPRESSIONS === 0 ? 0 : row.TOTAL_CLICKS / row.TOTAL_IMPRESSIONS;
        
        // A2C_RATE (handle division by zero)
        row.A2C_RATE = row.TOTAL_IMPRESSIONS === 0 ? 0 : row.TOTAL_A2C / row.TOTAL_IMPRESSIONS;

        // cost
        const cost_cpm = row.TOTAL_IMPRESSIONS * row.eCPM;
        const cost_cpc = row.TOTAL_CLICKS * row.eCPC;
        // Use BIDDING_TYPE (which is a group-by key) to decide cost
        row.cost = (row.BIDDING_TYPE && row.BIDDING_TYPE.toUpperCase().includes('CPM')) ? cost_cpm : cost_cpc;

        // TOTAL_ROI (handle division by zero)
        row.TOTAL_ROI = row.cost === 0 ? 0 : row.TOTAL_GMV / row.cost;
    }

    return finalData;
}

// --- Download Helper Function ---
function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { 
        // Browsers that support HTML5 download attribute
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
