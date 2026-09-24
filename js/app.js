const API_GET = 'api/get_kegiatan.php';
const API_SAVE = 'api/save_kegiatan.php';
const API_DELETE = 'api/delete_kegiatan.php';
const API_IMPORT = 'api/import_csv.php';

const app = {
    eventsData: [], tableInt: null, tableExt: null, calendar: null,

    init: async function() {
        this.setupPlugins();
        $.fn.dataTable.ext.search = []; 
        this.setupDataTablesFilter();
        this.setupTemplateInteractions();
        await this.loadData();
        
        $('#app-loader').addClass('d-none'); 
        $('#app-content').removeClass('d-none');
        
        this.initDataTables();
        this.initCalendar(); 
        
        if(typeof DashboardAnalytics !== 'undefined') DashboardAnalytics.init(this.eventsData);
    },

    setupPlugins: function() {
        $('.select2').select2({ theme: 'bootstrap-5', dropdownParent: $('#kegiatanModal') });
        $('.select2-filter').select2({ theme: 'bootstrap-5' });
        $('.flatpickr-date').flatpickr({ enableTime: false, dateFormat: "Y-m-d" });
        $('.flatpickr-range').flatpickr({ mode: "range", dateFormat: "Y-m-d", altInput: true, altFormat: "d M Y" });
    },

    setupDataTablesFilter: function() {
        $.fn.dataTable.ext.search.push((settings, data, dataIndex) => {
            const isExt = settings.nTable.id === 'dataTableExt';
            const currentTable = isExt ? this.tableExt : this.tableInt;
            if (!currentTable) return true;

            const filterUnit = $(isExt ? '#filterUnitExt' : '#filterUnit').val();
            const filterDate = $(isExt ? '#filterDateExt' : '#filterDate').val(); 
            const rowData = currentTable.row(dataIndex).data(); 
            if (!rowData) return true;

            const unitMatch = filterUnit === "" || rowData.unit === filterUnit;
            let dateMatch = true;
            if (filterDate) {
                const eventStart = rowData.mulai; 
                if (filterDate.includes(' to ')) {
                    const dates = filterDate.split(' to ');
                    dateMatch = (eventStart >= dates[0] && eventStart <= dates[1]);
                } else dateMatch = (eventStart === filterDate);
            }
            return unitMatch && dateMatch;
        });
    },

    setupTemplateInteractions: function() {
        $('#sidebarToggle').on('click', e => { e.preventDefault(); $('body').toggleClass('sb-sidenav-toggled'); });
        $('.menu-link').on('click', (e) => {
            e.preventDefault();
            $('.menu-link').removeClass('active'); $(e.currentTarget).addClass('active');
            $('.view-section').addClass('d-none');
            const target = $(e.currentTarget).data('target'); 
            $(`#${target}`).removeClass('d-none');
            $('#page-title').text($(e.currentTarget).data('title') || $(e.currentTarget).text().trim());
            
            if (target === 'calendar-view' && this.calendar) {
                setTimeout(() => {
                    this.calendar.render();
                    this.calendar.updateSize();
                }, 150);
            } else if (target === 'table-view') {
                setTimeout(() => { 
                    if (this.tableInt) this.tableInt.columns.adjust().responsive.recalc(); 
                    if (this.tableExt) this.tableExt.columns.adjust().responsive.recalc(); 
                }, 150);
            }
        });

        $('#kegiatanForm').on('submit', (e) => { e.preventDefault(); this.saveEvent(); });
        $('#fileCsv').on('change', (e) => { const file = e.target.files[0]; if (!file) return; this.handleCsvUpload(file); $(e.target).val(''); });
        $('#filterUnit, #filterDate').on('change', () => { if (this.tableInt) this.tableInt.draw(); });
        $('#btnResetFilter').on('click', () => { $('#filterUnit').val('').trigger('change'); document.querySelector('#filterDate')._flatpickr.clear(); if (this.tableInt) this.tableInt.draw(); });
        $('#filterUnitExt, #filterDateExt').on('change', () => { if (this.tableExt) this.tableExt.draw(); });
        $('#btnResetFilterExt').on('click', () => { $('#filterUnitExt').val('').trigger('change'); document.querySelector('#filterDateExt')._flatpickr.clear(); if (this.tableExt) this.tableExt.draw(); });
    },

    loadData: async function() {
        try {
            const response = await fetch(API_GET);
            const result = await response.json();
            this.eventsData = result.data || [];
        } catch (error) { 
            console.error("Fetch DB Error:", error);
            Swal.fire('Error', 'Gagal memuat data dari Database MySQL Lokal.', 'error');
        }
    },

    getUnitColorCode: function(unit) {
        const colors = {
            'Akademik dan Kerja Sama': '#0d6efd', 'Non Akademik dan Kemahasiswaan': '#dc3545', 'Lembaga Penjaminan Mutu (LPM)': '#6f42c1', 'LP2M': '#198754',
            'Program Studi Pembangunan Sosial': '#0dcaf0', 'Program Studi Ilmu Pemerintahan': '#fd7e14', 'Sekretariat': '#20c997', 'Unit Pangkalan Data & IT': '#6610f2',
            'Campus Ministry': '#e83e8c', 'Penerimaan Mahasiswa Baru (PMB)': '#d63384', 'UPT Perpustakaan': '#0dcaf0'
        }; return colors[unit] || '#6c757d';
    },

    getEventsArray: function() {
        let calEvents = [];
        this.eventsData.forEach(item => {
            if (item.mulai && item.selesai && item.mulai.includes('-')) {
                const [y, m, d] = item.selesai.split('-');
                const endDate = new Date(y, m - 1, d); endDate.setDate(endDate.getDate() + 1);
                const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
                const isExt = item.tipe === 'Eksternal';
                const eventColor = isExt ? '#ffc107' : this.getUnitColorCode(item.unit);

                calEvents.push({
                    id: item.id, 
                    title: (isExt ? '[EKS] ' : '') + item.nama, 
                    start: item.mulai, 
                    end: endStr, 
                    allDay: true,
                    backgroundColor: eventColor,
                    borderColor: eventColor,
                    textColor: isExt ? '#000' : '#fff'
                });
            }
        });
        return calEvents;
    },

    refreshUI: function() {
        const dInt = this.eventsData.filter(d => d.tipe === 'Internal');
        const dExt = this.eventsData.filter(d => d.tipe === 'Eksternal');
        if (this.tableInt) { this.tableInt.clear(); this.tableInt.rows.add(dInt); this.tableInt.draw(); }
        if (this.tableExt) { this.tableExt.clear(); this.tableExt.rows.add(dExt); this.tableExt.draw(); }
        if (this.calendar) { 
            this.calendar.removeAllEventSources(); 
            this.calendar.addEventSource(this.getEventsArray()); 
        }
        
        if(typeof DashboardAnalytics !== 'undefined') {
            DashboardAnalytics.populateCounters(this.eventsData);
            DashboardAnalytics.renderCharts(this.eventsData);
            DashboardAnalytics.detectConflicts(this.eventsData);
        }
    },

    initCalendar: function() {
        const calEl = document.getElementById('calendar');
        if (!calEl) return;
        this.calendar = new FullCalendar.Calendar(calEl, {
            initialView: 'dayGridMonth', firstDay: 0, 
            headerToolbar: { left: 'today prev,next', center: 'title', right: 'dayGridMonth,timeGridWeek' },
            events: this.getEventsArray(), // PENTING: Mamasukkan event saat inisialisasi
            editable: false, selectable: false, dayMaxEvents: true,
            eventClick: (i) => { this.viewDetail(i.event.id); }
        });

        this.calendar.render();
    },

    formatTanggalIndo: function(dateStr) {
        if(!dateStr || !dateStr.includes('-')) return '-';
        const [y, m, d] = dateStr.split('-');
        return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    },









initDataTables: function() {
        const dInt = this.eventsData.filter(d => d.tipe === 'Internal');
        const dExt = this.eventsData.filter(d => d.tipe === 'Eksternal');
        
        // Mengatur Layout DataTables: Buttons di kiri, Search di Kanan
        const dtDom = '<"row align-items-center mb-3"<"col-sm-12 col-md-6"B><"col-sm-12 col-md-6 d-flex justify-content-md-end"f>>rt<"row align-items-center mt-3"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7 d-flex justify-content-md-end"p>>';
        
        // Konfigurasi Tombol Terpisah untuk mencegah error DOM
        const btnsInternal = [ 
            { extend: 'copy', text: '<i class="fas fa-copy me-1"></i> Copy', className: 'btn-purple mb-2 shadow-sm' }, 
            { extend: 'excel', text: '<i class="fas fa-file-excel me-1"></i> Excel', className: 'btn-purple mb-2 shadow-sm' } 
        ];

        const btnsExternal = [ 
            { extend: 'copy', text: '<i class="fas fa-copy me-1"></i> Copy', className: 'btn-purple mb-2 shadow-sm' }, 
            { extend: 'excel', text: '<i class="fas fa-file-excel me-1"></i> Excel', className: 'btn-purple mb-2 shadow-sm' }, 
            { extend: 'print', text: '<i class="fas fa-print me-1"></i> Print', className: 'btn-purple mb-2 shadow-sm' } 
        ];

        if ($.fn.DataTable.isDataTable('#dataTable')) $('#dataTable').DataTable().destroy();
        if ($.fn.DataTable.isDataTable('#dataTableExt')) $('#dataTableExt').DataTable().destroy();

        // Render Tabel Internal
        this.tableInt = $('#dataTable').DataTable({ 
            data: dInt, responsive: true, scrollX: true, dom: dtDom, buttons: btnsInternal,
            columns: [
                { data: null, className: 'text-center', render: (d, t, r, m) => m.row + 1 },
                { data: 'unit' }, 
                { data: 'nama', className: 'fw-bold text-dark' },
                { data: 'mulai', render: (d) => this.formatTanggalIndo(d) },
                { data: 'selesai', render: (d) => this.formatTanggalIndo(d) },
                { data: 'pic' },
                { data: 'id', className: 'text-center',
                  render: id => `<div class="d-flex justify-content-center gap-2">
                      <button class="btn btn-sm btn-info text-white" onclick="app.viewDetail('${id}')" title="Lihat"><i class="fas fa-eye"></i></button>
                      <button class="btn btn-sm btn-primary" onclick="app.editEvent('${id}')" title="Edit"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-sm btn-danger" onclick="app.deleteEvent('${id}')" title="Hapus"><i class="fas fa-trash-alt"></i></button></div>`
                }
            ]
        });

        // Render Tabel Eksternal
        this.tableExt = $('#dataTableExt').DataTable({ 
            data: dExt, responsive: true, scrollX: true, dom: dtDom, buttons: btnsExternal,
            columns: [
                { data: null, className: 'text-center', render: (d, t, r, m) => m.row + 1 },
                { data: 'unit', render: d => `<span class="badge bg-warning text-dark">${d}</span>` },
                { data: 'nama', className: 'fw-bold text-dark' },
                { data: 'deskripsi', render: d => d ? `<div style="white-space: normal; min-width: 200px;">${d}</div>` : '-' },
                { data: 'mulai', render: (d) => this.formatTanggalIndo(d) },
                { data: 'selesai', render: (d) => this.formatTanggalIndo(d) },
                { data: 'pic' },
                { data: 'id', className: 'text-center',
                  render: id => `<div class="d-flex justify-content-center gap-2">
                      <button class="btn btn-sm btn-info text-white" onclick="app.viewDetail('${id}')" title="Lihat"><i class="fas fa-eye"></i></button>
                      <button class="btn btn-sm btn-primary" onclick="app.editEvent('${id}')" title="Edit"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-sm btn-danger" onclick="app.deleteEvent('${id}')" title="Hapus"><i class="fas fa-trash-alt"></i></button></div>`
                }
            ]
        });
    },










    viewDetail: function(id) {
        const item = this.eventsData.find(d => String(d.id) === String(id));
        if (!item) return;
        let htmlContent = `
            <table class="table table-sm table-bordered text-start mt-3">
                <tr><th width="35%" class="bg-light">Tipe</th><td><span class="badge bg-primary">${item.tipe}</span></td></tr>
                <tr><th class="bg-light">Unit</th><td>${item.unit}</td></tr>
                <tr><th class="bg-light">Kegiatan</th><td class="fw-bold">${item.nama}</td></tr>
                <tr><th class="bg-light">Waktu</th><td>${this.formatTanggalIndo(item.mulai)} s.d ${this.formatTanggalIndo(item.selesai)}</td></tr>
                <tr><th class="bg-light">PIC</th><td>${item.pic}</td></tr>
                <tr><th class="bg-light">Status Sync</th><td><span class="badge ${item.status_sync === 'Synced' ? 'bg-success' : 'bg-secondary'}">${item.status_sync}</span></td></tr>
            </table>`;
        Swal.fire({ title: 'Detail Kegiatan', html: htmlContent, icon: 'info', confirmButtonText: 'Tutup' });
    },

    editEvent: function(id) {
        const item = this.eventsData.find(d => String(d.id) === String(id));
        if (!item) return;
        $('#event_id').val(item.id); 
        $('#tipe_kegiatan').val(item.tipe).trigger('change'); 
        $('#unit').val(item.unit).trigger('change'); 
        $('#nama_kegiatan').val(item.nama);
        $('#deskripsi').val(item.deskripsi); 
        $('#tanggal_mulai').val(item.mulai);
        $('#tanggal_selesai').val(item.selesai);
        $('#pic').val(item.pic).trigger('change'); 
        $('#kegiatanModal').modal('show');
    },

    openModal: function() {
        $('#kegiatanForm')[0].reset(); $('#event_id').val('');
        $('#tipe_kegiatan').val('Internal').trigger('change'); $('.select2').val('').trigger('change');
        $('#kegiatanModal').modal('show');
    },

    saveEvent: async function() {
        const payload = {
            id: $('#event_id').val(), tipe: $('#tipe_kegiatan').val(), unit: $('#unit').val(), 
            nama_kegiatan: $('#nama_kegiatan').val(), deskripsi: $('#deskripsi').val() || '', 
            tanggal_mulai: $('#tanggal_mulai').val(), tanggal_selesai: $('#tanggal_selesai').val(), pic: $('#pic').val()
        };
        const btn = $('#btnSave');
        btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin me-1"></i> Menyimpan...');
        try {
            const res = await fetch(API_SAVE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (data.status === 'success') { 
                Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tersimpan ke Database!', showConfirmButton: false, timer: 3000 });
                $('#kegiatanModal').modal('hide'); 
                await this.loadData(); this.refreshUI(); 
            } else throw new Error(data.message);
        } catch (err) { Swal.fire('Error', err.message, 'error'); } 
        finally { btn.prop('disabled', false).text('Simpan Kegiatan'); }
    },

    deleteEvent: function(id) {
        Swal.fire({ title: 'Hapus Data?', text: "Data akan dihapus dari Database lokal.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Ya, hapus!'})
        .then(async r => {
            if (r.isConfirmed) {
                try {
                    const res = await fetch(API_DELETE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
                    const data = await res.json();
                    if(data.status === 'success') { 
                        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Terhapus!', showConfirmButton: false, timer: 2000 });
                        await this.loadData(); this.refreshUI(); 
                    } else throw new Error(data.message);
                } catch (e) { Swal.fire('Error', 'Gagal menghapus data.', 'error'); }
            }
        });
    },

    handleCsvUpload: function(file) {
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            transformHeader: h => h.replace(/^\uFEFF/, '').trim(),
            complete: async (results) => {
                const data = results.data;
                if (data.length === 0) return Swal.fire('Peringatan', 'File CSV kosong', 'warning');
                this.processBulkImport(data);
            }
        });
    },

    processBulkImport: async function(dataList) {
        Swal.fire({ title: 'Mengimpor CSV ke Database...', html: `<div class="mb-3 text-info fw-bold">Memproses ${dataList.length} data...</div>`, allowOutsideClick: false, showConfirmButton: false, didOpen: () => { Swal.showLoading(); }});
        try {
            const response = await fetch(API_IMPORT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataList) });
            const result = await response.json();
            if (result.status === 'success') {
                Swal.fire({ title: 'Impor Selesai!', html: `Berhasil disimpan ke Database: <b class="text-success">${result.successCount}</b><br>Gagal: <b class="text-danger">${result.errorCount}</b><br><br><small class="text-muted">Data ini berstatus <b>Unsynced</b>.</small>`, icon: 'success', confirmButtonText: 'Tutup' })
                .then(() => { this.loadData().then(() => this.refreshUI()); });
            } else throw new Error(result.message);
        } catch (error) { Swal.fire('Gagal Import', error.message, 'error'); }
    },

// TOMBOL SYNC GOOGLE
// TOMBOL SYNC GOOGLE (PROGRESS BAR NYATA & JEDA OTOMATIS)
    syncToGoogle: async function() {
        // Hanya menyaring data yang belum sinkron
        const unsyncedData = this.eventsData.filter(d => d.status_sync === 'Unsynced');
        const totalData = unsyncedData.length;

        if (totalData === 0) {
            return Swal.fire('Sudah Sinkron', 'Tidak ada kegiatan baru yang perlu disinkronkan. Data yang sudah sinkron tidak akan terkirim dua kali.', 'info');
        }

        Swal.fire({
            title: 'Menyinkronkan ke Google...',
            html: `
                <div class="mb-3 text-primary fw-bold" id="sync-text">Memproses 0 dari ${totalData} kegiatan baru...</div>
                <div class="progress mx-auto shadow-sm" style="height: 25px; border-radius: 10px; width: 85%;">
                    <div id="sync-progress" class="progress-bar progress-bar-striped progress-bar-animated bg-warning text-dark" role="progressbar" style="width: 0%; font-weight: bold; font-size: 14px;">0%</div>
                </div>
                <small class="text-muted mt-3 d-block" id="sync-note">Memproses secara bertahap untuk mencegah pemblokiran dari Google.<br><b>Jangan tutup atau refresh halaman ini!</b></small>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false
        });

        const progressBar = $('#sync-progress');
        const progressText = $('#sync-text');
        const progressNote = $('#sync-note');
        
        const chunkSize = 20; // Kirim 20 data per pengiriman
        let totalSynced = 0;
        let hasError = false;

        // Proses Antrean Data
        for (let i = 0; i < totalData; i += chunkSize) {
            const chunk = unsyncedData.slice(i, i + chunkSize);
            
            try {
                const response = await fetch('api/sync_google.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chunk)
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    totalSynced += result.count;
                    
                    // Hitung dan jalankan Progress Bar secara nyata
                    let percent = Math.round((totalSynced / totalData) * 100);
                    progressBar.css('width', percent + '%').text(percent + '%');
                    progressText.text(`Berhasil mengirim ${totalSynced} dari ${totalData} kegiatan...`);
                } else {
                    throw new Error(result.message);
                }

                // LOGIKA JEDA 1 MENIT: Jika kelipatan 100 data dan masih ada sisa data
                if (totalSynced % 100 === 0 && totalSynced < totalData) {
                    progressBar.removeClass('bg-warning text-dark').addClass('bg-info text-white');
                    progressText.text(`Mendinginkan Server...`);
                    progressNote.html(`<span class="text-danger fw-bold">Penundaan 1 Menit agar Google API tidak memblokir akses...</span>`);
                    
                    await sleep(60000); // Tunggu 60 Detik
                    
                    // Kembalikan ke tampilan loading
                    progressBar.removeClass('bg-info text-white').addClass('bg-warning text-dark');
                    progressNote.html(`Melanjutkan pengiriman data...<br><b>Jangan tutup halaman ini!</b>`);
                } else if (totalSynced < totalData) {
                    // Jeda biasa 2 detik antar kelopok (20 data)
                    await sleep(2000);
                }

            } catch (error) {
                hasError = true;
                progressBar.removeClass('bg-warning text-dark').addClass('bg-danger text-white').text('Gagal');
                progressText.removeClass('text-primary').addClass('text-danger').text('Terjadi Kesalahan!');
                
                await sleep(500);
                Swal.fire('Proses Terhenti', `Sinkronisasi terputus pada data ke-${totalSynced}. Pesan: ${error.message}`, 'error').then(() => {
                    this.loadData().then(() => this.refreshUI()); // Reload data yang sudah berhasil masuk
                });
                break; // Keluar dari perulangan
            }
        }

        if (!hasError) {
            progressBar.css('width', '100%').text('100%').removeClass('bg-warning text-dark').addClass('bg-success text-white');
            progressText.text('Sinkronisasi Selesai!').removeClass('text-primary').addClass('text-success');
            progressNote.text('Semua kegiatan baru berhasil diamankan di Google Calendar & Sheets.');
            await sleep(1000); 

            Swal.fire({
                title: 'Sinkronisasi Berhasil!',
                html: `Sebanyak <b>${totalSynced} kegiatan baru</b> sukses terkirim.<br>Data lama tetap aman dan tidak digandakan.`,
                icon: 'success',
                confirmButtonText: 'Tutup'
            }).then(() => { 
                this.loadData().then(() => this.refreshUI()); 
            });
        }
    }


};

$(document).ready(() => app.init());