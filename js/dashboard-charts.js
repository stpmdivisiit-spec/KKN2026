/**
 * DASHBOARD-CHARTS.JS - MYSQL NATIVE VERSION WITH INSIGHTS
 */
const DashboardAnalytics = {
    barChartInstance: null,
    doughnutChartInstance: null,
    picBarChartInstance: null,
    dayOfWeekChartInstance: null,
    avgDurationChartInstance: null,

    init: function(data) {
        if (typeof feather !== 'undefined') feather.replace();
        
        // Data filter hanya untuk kegiatan
        const eventData = data.filter(d => d.tipe !== 'Dokumentasi');

        this.populateCounters(eventData);
        this.renderHeatmap(eventData); 
        this.renderCharts(eventData);
        this.detectConflicts(eventData);
    },

    populateCounters: function(data) {
        try {
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();

            $('#stat-total').text(data.length);
            const futureCount = data.filter(d => d.mulai && new Date(d.mulai) >= currentDate).length;
            $('#stat-upcoming').text(futureCount);

            const thisMonthData = data.filter(d => {
                if(!d.mulai) return false;
                const dDate = new Date(d.mulai);
                return !isNaN(dDate.getTime()) && dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear;
            });
            $('#stat-month').text(thisMonthData.length);

            const unitFreq = {};
            thisMonthData.forEach(d => { unitFreq[d.unit] = (unitFreq[d.unit] || 0) + 1; });
            const topUnit = Object.keys(unitFreq).sort((a,b) => unitFreq[b] - unitFreq[a])[0];
            $('#stat-busiest-unit').text(topUnit || 'Belum Ada Data');

            const picFreq = {};
            thisMonthData.forEach(d => { picFreq[d.pic] = (picFreq[d.pic] || 0) + 1; });
            const topPIC = Object.keys(picFreq).sort((a,b) => picFreq[b] - picFreq[a])[0];
            $('#stat-busiest-pic').text(topPIC ? topPIC.split(',')[0] : 'Belum Ada Data');
        } catch (e) { console.error("Error populateCounters:", e); }
    },

    detectConflicts: function(data) {
        try {
            const validData = data.filter(d => d.mulai && d.selesai && d.mulai.includes('-'));
            let conflicts = [];
            let conflictingEventIds = new Set();
            
            for (let i = 0; i < validData.length; i++) {
                for (let j = i + 1; j < validData.length; j++) {
                    let start1 = new Date(validData[i].mulai).getTime();
                    let end1 = new Date(validData[i].selesai).getTime();
                    let start2 = new Date(validData[j].mulai).getTime();
                    let end2 = new Date(validData[j].selesai).getTime();

                    if (start1 <= end2 && start2 <= end1) {
                        conflicts.push({ eventA: validData[i], eventB: validData[j] });
                        
                        const idA = validData[i].id;
                        const idB = validData[j].id;
                        
                        conflictingEventIds.add(idA);
                        conflictingEventIds.add(idB);
                    }
                }
            }

            $('#stat-conflicts').text(conflicts.length);
            $('#badge-conflict-count').text(conflicts.length);

            const conflictRate = validData.length > 0 ? ((conflictingEventIds.size / validData.length) * 100).toFixed(1) : 0;
            $('#stat-conflict-rate').text(`${conflictRate}%`);

            const listContainer = $('#conflict-list');
            listContainer.empty();

            if (conflicts.length === 0) {
                listContainer.append('<div class="p-4 text-center text-muted small"><i class="fas fa-check-circle text-success me-2"></i>Jadwal aman, tidak ada kegiatan yang bertabrakan.</div>');
                $('#insight-conflict').html('<i class="fas fa-check me-1"></i> <b>Kesimpulan:</b> Alur kegiatan berjalan ideal tanpa adanya tumpang tindih penugasan PIC atau bentrok ruangan.').removeClass('bg-danger text-danger').addClass('bg-success bg-opacity-10 text-success');
            } else {
                // Batasi max 30 agar DOM tidak hang
                const maxDisplay = conflicts.slice(0, 30);
                maxDisplay.forEach(c => {
                    const dateStr = new Date(c.eventA.mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    listContainer.append(`
                        <div class="list-group-item list-group-item-action p-2">
                            <div class="d-flex w-100 justify-content-between mb-1">
                                <h6 class="mb-0 fw-bold text-danger" style="font-size: 0.85rem;">⚠️ Tabrakan Terdeteksi</h6>
                                <small class="text-muted fw-bold">${dateStr}</small>
                            </div>
                            <div class="small mb-1 text-truncate"><b>1.</b> ${c.eventA.nama} <span class="text-primary">(${c.eventA.unit})</span></div>
                            <div class="small text-truncate"><b>2.</b> ${c.eventB.nama} <span class="text-primary">(${c.eventB.unit})</span></div>
                        </div>
                    `);
                });

                let insightMsg = `<i class="fas fa-exclamation-triangle me-1"></i> <b>Kesimpulan:</b> Tingkat bentrok mencapai <b>${conflictRate}%</b>. Indikator ini sangat tinggi yang mengartikan sistem mencatat banyak program kerja berdurasi panjang yang berjalan secara beririsan dengan kegiatan operasional harian.`;
                $('#insight-conflict').html(insightMsg).removeClass('bg-success text-success').addClass('bg-danger bg-opacity-10 text-danger');
            }
        } catch (e) { console.error("Error detectConflicts:", e); }
    },

    renderHeatmap: function(data) {
        try {
            const container = $('#heatmap-container');
            if (container.length === 0) return;
            container.empty();

            const heatData = Array.from({length: 7}, () => new Array(12).fill(0));
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
            let maxMonthIndex = -1;
            let maxMonthVal = 0;
            const monthTotals = new Array(12).fill(0);

            data.forEach(d => {
                if (!d.mulai || !d.mulai.includes('-')) return;
                const dt = new Date(d.mulai);
                if (!isNaN(dt.getTime())) {
                    const m = dt.getMonth();
                    let day = dt.getDay() - 1; 
                    if (day === -1) day = 6; 
                    heatData[day][m]++;
                    monthTotals[m]++;
                }
            });

            // Cari bulan terpadat
            monthTotals.forEach((val, idx) => {
                if (val > maxMonthVal) { maxMonthVal = val; maxMonthIndex = idx; }
            });

            let maxVal = 1;
            heatData.forEach(row => row.forEach(val => { if(val > maxVal) maxVal = val; }));

            let html = '<div style="display:flex; flex-direction:column; gap:6px; overflow-x:auto; padding:10px 0;">';
            
            html += '<div style="display:flex; gap:6px; margin-left: 36px;">';
            monthNames.forEach(m => { html += `<div style="width: 38px; text-align:center; font-size:11px; color:#6c757d; font-weight:bold;">${m}</div>`; });
            html += '</div>';

            for (let r = 0; r < 7; r++) {
                html += '<div style="display:flex; gap:6px; align-items:center;">';
                html += `<div style="width: 30px; font-size:11px; color:#6c757d; text-align:right; padding-right:4px; font-weight:bold;">${dayLabels[r]}</div>`;
                
                for (let c = 0; c < 12; c++) {
                    const val = heatData[r][c];
                    let levelClass = 'heatmap-empty';
                    if (val > 0) {
                        const ratio = val / maxVal;
                        if (ratio > 0.75) levelClass = 'heatmap-high';
                        else if (ratio > 0.40) levelClass = 'heatmap-medium';
                        else levelClass = 'heatmap-low';
                    }
                    html += `<div class="heatmap-box ${levelClass}" style="width:14px; height:14px; border-radius:3px; background:${levelClass === 'heatmap-high' ? '#0d6efd' : levelClass === 'heatmap-medium' ? '#70b8ff' : levelClass === 'heatmap-low' ? '#c6e7ff' : '#e9ecef'};" title="${val} Kegiatan di hari ${dayLabels[r]}, Bulan ${monthNames[c]}"></div>`;
                }
                html += '</div>';
            }
            html += '</div>';
            container.html(html);

            // INSIGHT HEATMAP
            let heatMsg = "Pola pelaksanaan kegiatan merata sepanjang tahun.";
            if (maxMonthIndex !== -1 && maxMonthVal > 0) {
                heatMsg = `Intensitas kegiatan paling pekat terpusat pada bulan <b>${monthNames[maxMonthIndex]}</b> dengan total <b>${maxMonthVal} kegiatan</b>. Beban manajemen operasional institusi berada pada puncaknya di titik ini.`;
            }
            $('#insight-heatmap').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> ${heatMsg}`);

        } catch (e) { console.error("Error renderHeatmap:", e); }
    },

    renderCharts: function(data) {
        const unitMap = {};
        const timeMap = {};
        const picDetailsMap = {}; 
        const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; 
        const unitDurationSum = {};
        const unitDurationCount = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        data.forEach(d => {
            if(!d.mulai || !d.selesai || !d.mulai.includes('-')) return;

            const startDt = new Date(d.mulai);
            const endDt = new Date(d.selesai);

            if (!isNaN(startDt.getTime())) {
                unitMap[d.unit] = (unitMap[d.unit] || 0) + 1;
                
                if (!picDetailsMap[d.pic]) picDetailsMap[d.pic] = [];
                picDetailsMap[d.pic].push({ nama: d.nama, tanggal: d.mulai });

                const dayIdx = startDt.getDay();
                dayOfWeekCounts[dayIdx]++;

                const year = startDt.getFullYear();
                const month = String(startDt.getMonth() + 1).padStart(2, '0');
                const key = `${year}-${month}`; 
                timeMap[key] = (timeMap[key] || 0) + 1;

                if (!isNaN(endDt.getTime())) {
                    const durationDays = Math.max(1, Math.round((endDt - startDt) / (1000 * 60 * 60 * 24)) + 1);
                    unitDurationSum[d.unit] = (unitDurationSum[d.unit] || 0) + durationDays;
                    unitDurationCount[d.unit] = (unitDurationCount[d.unit] || 0) + 1;
                }
            }
        });

        // ================= INSIGHT LOGIC =================

        // 1. Insight Doughnut (Proporsi Unit)
        const sortedUnits = Object.keys(unitMap).sort((a,b) => unitMap[b] - unitMap[a]);
        if (sortedUnits.length > 0) {
            const topDoughnut = sortedUnits[0];
            const pctDoughnut = ((unitMap[topDoughnut] / data.length) * 100).toFixed(1);
            $('#insight-doughnut').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> <b>${topDoughnut}</b> mendominasi <b>${pctDoughnut}%</b> dari keseluruhan aktivitas di STPM. Ini mengindikasikan unit ini sebagai motor penggerak utama program operasional.`);
        }

        // 2. Insight Day of Week (Distribusi Hari)
        const orderedDayCounts = [
            dayOfWeekCounts[1], dayOfWeekCounts[2], dayOfWeekCounts[3],
            dayOfWeekCounts[4], dayOfWeekCounts[5], dayOfWeekCounts[6], dayOfWeekCounts[0]
        ];
        const dayLabelsIndo = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
        const maxDayIndex = orderedDayCounts.indexOf(Math.max(...orderedDayCounts));
        const weekendCount = orderedDayCounts[5] + orderedDayCounts[6];
        const isWeekendHeavy = weekendCount > (data.length * 0.3);
        
        let dayMsg = `Kegiatan rutin sangat intensif pada hari <b>${dayLabelsIndo[maxDayIndex]}</b>. `;
        if (isWeekendHeavy) dayMsg += `Tercatat bahwa distribusi hari libur (Sabtu-Minggu) menyumbang angka yang cukup signifikan akibat penarikan rentang tanggal program jangka panjang yang melewati akhir pekan.`;
        $('#insight-day').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> ${dayMsg}`);

        // 3. Insight Avg Duration
        let avgDurationLabels = Object.keys(unitDurationSum);
        let avgDurationValues = avgDurationLabels.map(u => (unitDurationSum[u] / unitDurationCount[u]).toFixed(1));
        
        if (avgDurationLabels.length > 0) {
            const maxDurationValue = Math.max(...avgDurationValues);
            const maxDurationUnit = avgDurationLabels[avgDurationValues.indexOf(String(maxDurationValue))];
            $('#insight-duration').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> <b>${maxDurationUnit}</b> memegang rekor rata-rata durasi program terpanjang (<b>${maxDurationValue} Hari</b>/Program). Hal ini mencirikan penugasan yang bersifat struktural dan berkelanjutan.`);
        } else {
            avgDurationLabels = ['Belum Ada Data'];
            avgDurationValues = [0];
        }

        // 4. Insight PIC
        const sortedPIC = Object.keys(picDetailsMap).sort((a,b) => picDetailsMap[b].length - picDetailsMap[a].length);
        if (sortedPIC.length > 0) {
            $('#insight-pic').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> Beban delegasi kegiatan sangat tersentralisasi. <b>${sortedPIC[0].split(',')[0]}</b> memikul beban tugas tertinggi dengan total <b>${picDetailsMap[sortedPIC[0]].length} penugasan</b>.`);
        }

        // 5. Insight Trend
        const sortedTimeKeys = Object.keys(timeMap).sort();
        const timeLabels = [];
        const timeData = [];

        sortedTimeKeys.forEach(key => {
            const parts = key.split('-');
            const year = parts[0];
            const monthIndex = parseInt(parts[1], 10) - 1;
            timeLabels.push(`${monthNames[monthIndex]} ${year}`);
            timeData.push(timeMap[key]);
        });

        if (timeData.length > 0) {
            const maxTimeVal = Math.max(...timeData);
            const maxTimeLabel = timeLabels[timeData.indexOf(maxTimeVal)];
            $('#insight-trend').html(`<i class="fas fa-lightbulb text-warning me-1"></i> <b>Kesimpulan:</b> Grafik trend memvalidasi bahwa terdapat lonjakan signifikan yang memuncak pada <b>${maxTimeLabel}</b>. Lonjakan siklus ini merepresentasikan momentum krusial eksekusi akademik kampus.`);
        }

        // ================= CHART RENDERING =================

        const primaryColor = 'rgba(13, 110, 253, 0.85)';
        const bgColors = ['#0d6efd', '#dc3545', '#6f42c1', '#198754', '#0dcaf0', '#fd7e14', '#ffc107', '#20c997', '#e83e8c', '#6610f2', '#d63384'];

        if (this.barChartInstance) this.barChartInstance.destroy();
        if (this.doughnutChartInstance) this.doughnutChartInstance.destroy();
        if (this.picBarChartInstance) this.picBarChartInstance.destroy();
        if (this.dayOfWeekChartInstance) this.dayOfWeekChartInstance.destroy();
        if (this.avgDurationChartInstance) this.avgDurationChartInstance.destroy();

        try {
            const ctxBar = document.getElementById('barChart');
            if (ctxBar && timeLabels.length > 0) {
                this.barChartInstance = new Chart(ctxBar, {
                    type: 'bar',
                    data: { labels: timeLabels, datasets: [{ label: 'Total Kegiatan', data: timeData, backgroundColor: primaryColor, borderRadius: 4 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                });
            }
        } catch (e) {}

        try {
            const ctxDoughnut = document.getElementById('doughnutChart');
            if (ctxDoughnut && Object.keys(unitMap).length > 0) {
                this.doughnutChartInstance = new Chart(ctxDoughnut, {
                    type: 'doughnut',
                    data: { labels: Object.keys(unitMap), datasets: [{ data: Object.values(unitMap), backgroundColor: bgColors.slice(0, Object.keys(unitMap).length) }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
                });
            }
        } catch (e) {}

        try {
            const ctxDay = document.getElementById('dayOfWeekChart');
            if (ctxDay) {
                this.dayOfWeekChartInstance = new Chart(ctxDay, {
                    type: 'bar',
                    data: {
                        labels: dayLabelsIndo,
                        datasets: [{ label: 'Jumlah Kegiatan', data: orderedDayCounts, backgroundColor: '#6f42c1', borderRadius: 4 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                });
            }
        } catch (e) {}

        try {
            const ctxAvg = document.getElementById('avgDurationChart');
            if (ctxAvg) {
                this.avgDurationChartInstance = new Chart(ctxAvg, {
                    type: 'bar',
                    data: {
                        labels: avgDurationLabels.map(u => u.split(' ').slice(0, 2).join(' ')),
                        datasets: [{ label: 'Rata-rata Durasi (Hari)', data: avgDurationValues, backgroundColor: '#198754', borderRadius: 4 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
                });
            }
        } catch (e) {}

        try {
            const ctxPic = document.getElementById('picBarChart');
            if (ctxPic && Object.keys(picDetailsMap).length > 0) {
                const picDataList = sortedPIC.slice(0, 10).map(pic => picDetailsMap[pic].length);
                const shortLabels = sortedPIC.slice(0, 10).map(pic => pic.split(' ').slice(0, 2).join(' '));

                this.picBarChartInstance = new Chart(ctxPic, {
                    type: 'bar', 
                    data: {
                        labels: shortLabels,
                        datasets: [{ label: 'Total Penugasan', data: picDataList, backgroundColor: '#0dcaf0', borderRadius: 4 }]
                    },
                    options: {
                        indexAxis: 'y', responsive: true, maintainAspectRatio: false, 
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });
            }
        } catch (e) {}
    }
    
};