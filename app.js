/**
 * [app.js] - Fixed & Hardened Version (The Real Final)
 * JSON.parse 에러와 널 참조 버그를 완전히 수정한 결정판
 */

var app = {
  db: {
    mainKey: 'prof_gaegyebu_v3',
    backupKeys: ['prof_gaegyebu_v2', 'gaegyebu_data', 'accounting_db', 'transactions'],
    data: {
      transactions: [],
      assetEntries: [],
      templates: [],
      categories: {
        income: ["근로소득", "사업소득", "기타소득"],
        expense: ["식비", "교통비", "문화생활", "통신비", "쇼핑", "기타"],
        asset: ["현금", "예금", "보험", "주식", "자동차", "부동산"],
        liability: ["카드미결제", "은행대출", "개인부채"]
      },
      settings: { theme: 'dark', fontSize: 1.0, userName: '사용자님' }
    }
  },

  currentDate: new Date(),
  selectedDate: "",
  editingId: null,

  init: function() {
    try {
      console.log("App starting...");
      this.selectedDate = this.fmtDate(this.currentDate);
      this.load();
      this.apply();
      this.render();
      // 금액 입력 실시간 콤마 포맷팅
      var amtInput = document.getElementById('in-amount');
      if (amtInput) {
        amtInput.addEventListener('input', function() {
          var raw = this.value.replace(/[^0-9]/g, '');
          this.value = raw ? Number(raw).toLocaleString() : '';
        });
      }
      var tplAmtInput = document.getElementById('tpl-amount');
      if (tplAmtInput) {
        tplAmtInput.addEventListener('input', function() {
          var raw = this.value.replace(/[^0-9]/g, '');
          this.value = raw ? Number(raw).toLocaleString() : '';
        });
      }
      var revalueAmtInput = document.getElementById('revalue-amount');
      if (revalueAmtInput) {
        revalueAmtInput.addEventListener('input', function() {
          var raw = this.value.replace(/[^0-9]/g, '');
          this.value = raw ? Number(raw).toLocaleString() : '';
        });
      }
      this.updateTemplateBadge();
      console.log("App initialized successfully.");
    } catch(e) {
      alert("초기화 오류: " + e.message);
      console.error(e);
    }
  },

  load: function() {
    try {
      var saved = localStorage.getItem(this.db.mainKey);
      var parsed = null;
      
      try { if(saved) parsed = JSON.parse(saved); } catch(x) {}

      // 메인이 비었거나 데이터가 없는 경우 복구 시도
      if (!parsed || !parsed.transactions || parsed.transactions.length === 0) {
        for (var i = 0; i < this.db.backupKeys.length; i++) {
          var old = localStorage.getItem(this.db.backupKeys[i]);
          if (old) {
            try {
              var pOld = JSON.parse(old);
              if (pOld && (pOld.transactions || pOld.assetEntries)) {
                parsed = pOld;
                console.log("Data recovered from:", this.db.backupKeys[i]);
                break;
              }
            } catch(y) {}
          }
        }
      }

      if (parsed) {
        this.db.data.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        this.db.data.assetEntries = Array.isArray(parsed.assetEntries) ? parsed.assetEntries : [];
        this.db.data.templates = Array.isArray(parsed.templates) ? parsed.templates : [];
        if (parsed.categories) this.db.data.categories = parsed.categories;
        if (parsed.settings) this.db.data.settings = Object.assign(this.db.data.settings, parsed.settings);
      }

      // [마이그레이션] 자산/부채 재평가 이력 관리를 위해 각 항목에 고유 그룹ID를 부여한다.
      // 기존 항목은 전부 "각자 독립된 자산"으로 취급 (자기 자신의 id를 그룹ID로 사용) — 서로 합산되던 방식은 그대로 유지됨.
      this.db.data.assetEntries.forEach(function(a) { if (!a.groupId) a.groupId = a.id; });

      // [마이그레이션] 부채와 이름이 겹치는 지출 카테고리는 제거한다.
      // 부채 상환은 이제 "부채상환" 전용 흐름으로 처리하고 손익(지출) 항목에서 완전히 분리하기 때문.
      if (this.db.data.categories.expense && this.db.data.categories.liability) {
        var liabNames = this.db.data.categories.liability;
        this.db.data.categories.expense = this.db.data.categories.expense.filter(function(c) {
          return liabNames.indexOf(c) === -1;
        });
      }

      // [마이그레이션] 골프비: 단순 이름표만 다른 게 아니라 "일상 라운딩/스크린골프"와
      // "해외 회원권·원정(연회비, 항공권/호텔/렌트카, 환전 등)"이 하나의 카테고리에 섞여 있어
      // 메모 키워드로 내용을 보고 분류한다. (모호하면 '골프비-일상'으로 남으니 필요시 설정에서 직접 수정 가능)
      // -- 아래 flatToHierarchicalRenames보다 먼저 실행해서, 방금 분류된 이름도 그 자리에서 바로 다듬어지게 한다.
      var golfTravelKeywords = ['오챠드', '항공권', '호텔', '렌트카', '환전', '연회비', '연간회비'];
      function isGolfTravel(memo) {
        var m = String(memo || '');
        return golfTravelKeywords.some(function(k) { return m.indexOf(k) !== -1; });
      }
      if (this.db.data.categories.expense.indexOf('골프비') !== -1 || this.db.data.transactions.some(function(t){ return t.category_name === '골프비'; })) {
        var gi = this.db.data.categories.expense.indexOf('골프비');
        if (gi !== -1) this.db.data.categories.expense.splice(gi, 1, '골프비-일상', '골프비-멤버십여행');
        this.db.data.transactions.forEach(function(t) {
          if (t.category_name !== '골프비') return;
          t.category_name = isGolfTravel(t.memo) ? '골프비-멤버십여행' : '골프비-일상';
        });
        this.db.data.templates.forEach(function(tp) {
          if (tp.category_name !== '골프비') return;
          tp.category_name = isGolfTravel(tp.memo) ? '골프비-멤버십여행' : '골프비-일상';
        });
      }

      // [마이그레이션] 흩어져 있던 세부 항목들을 "대분류-소분류" 컨벤션으로 통일
      var flatToHierarchicalRenames = {
        '교통비(대중교통)': '교통비-지하철.버스.택시',
        '교통비-대중교통': '교통비-지하철.버스.택시', // 이미 1차 마이그레이션된 기기용
        '교통비(전기차충전)': '교통비-전기차충전',
        '외식비': '외식비-개인',
        '가족 외식비': '외식비-가족',
        '지인 외식비': '외식비-지인',
        '골프비-멤버십여행': '골프비-오챠드', // 골프비 1차 분류 이후 이름 다듬기
        '클로드 등 AI 사용료': '구독료-AI 사용료',
        '인터넷사용비': '구독료-인터넷사용료',
        '구독료': '구독료-기타',
        '식자재 등 쇼핑': '쇼핑-오프라인 쇼핑',
        '온라인쇼핑': '쇼핑-온라인 쇼핑'
      };
      for (var oldCatName in flatToHierarchicalRenames) {
        var newCatName = flatToHierarchicalRenames[oldCatName];
        var ci = this.db.data.categories.expense.indexOf(oldCatName);
        if (ci !== -1) this.db.data.categories.expense[ci] = newCatName;
        this.db.data.transactions.forEach(function(t) { if (t.category_name === oldCatName) t.category_name = newCatName; });
        this.db.data.templates.forEach(function(tp) { if (tp.category_name === oldCatName) tp.category_name = newCatName; });
      }
    } catch (e) {
      console.error("Load critical failure", e);
    }
  },

  fmtDate: function(d) {
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
  },

  // 사용자 입력값(카테고리명/메모 등)을 innerHTML에 안전하게 꽂기 위한 이스케이프
  escapeHtml: function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  },

  // 카테고리명 "대분류-소분류" 문자열 컨벤션 파서. 하이픈이 없으면 소분류 없이 대분류만 있는 것으로 취급.
  splitCategory: function(name) {
    var s = String(name || '');
    var idx = s.indexOf('-');
    if (idx === -1) return { major: s.trim(), minor: null };
    // 하이픈 앞뒤에 공백이 있어도("외식비 - 커피") 공백 없는 것("외식비-커피")과 같은 대분류로 묶이도록 trim한다.
    var major = s.slice(0, idx).trim();
    var minor = s.slice(idx + 1).trim();
    return { major: major, minor: minor || null };
  },

  // 같은 자산/부채(groupId)의 재평가 이력 중, 기준일자 이하에서 가장 최신인 것 하나만 골라낸다.
  // (동일 그룹은 이 최신값 하나로만 반영되고, 서로 다른 그룹끼리만 합산된다 — 예: 자동차 2대는 각자 다른 그룹)
  getLatestAssetsByGroup: function(asOfDate) {
    var latest = {};
    this.db.data.assetEntries.forEach(function(it) {
      if (asOfDate && it.date > asOfDate) return;
      var gid = it.groupId || it.id;
      var cur = latest[gid];
      if (!cur || it.date > cur.date || (it.date === cur.date && it.id > cur.id)) {
        latest[gid] = it;
      }
    });
    return latest;
  },

  // ===================== 📥 항목/부채 선택 바텀시트 =====================
  // 안드로이드 네이티브 select 팝업은 OS가 그려서 앱의 다크 테마 CSS가 전혀 먹히지 않기 때문에
  // (항상 흰 배경으로 뜸), select 대신 앱이 직접 그리는 바텀시트로 대체한다.
  // 실제 값은 숨겨진 <input type="hidden">에 저장하고, 화면에는 라벨만 표시한다.
  _categoryPickerContexts: {
    modal: { valueId: 'in-category', labelId: 'in-category-label', getType: function(){ return app.modalType; } },
    template: { valueId: 'tpl-category', labelId: 'tpl-category-label', getType: function(){ return document.getElementById('tpl-type').value; } }
  },

  openCategoryPicker: function(ctxKey) {
    var ctx = this._categoryPickerContexts[ctxKey];
    if (!ctx) return;
    this._categoryPickerCtx = ctx;
    var type = ctx.getType();
    var cats = this.db.data.categories[type] || [];

    // 같은 대분류끼리 인접하도록 묶는다
    var groups = {}, order = [];
    cats.forEach(function(name) {
      var major = app.splitCategory(name).major;
      if (!groups[major]) { groups[major] = []; order.push(major); }
      groups[major].push(name);
    });

    this._categoryPickerList = [];
    var html = order.map(function(major) {
      var items = groups[major];
      var header = '<div class="cat-picker-header">' + app.escapeHtml(major) + '</div>';
      var rows = items.map(function(name) {
        var idx = app._categoryPickerList.length;
        app._categoryPickerList.push(name);
        var minor = app.splitCategory(name).minor;
        var label = items.length > 1 ? (minor || '(기본)') : name;
        return '<div class="cat-picker-row" onclick="app.selectCategoryFromPicker(' + idx + ')">' + app.escapeHtml(label) + '</div>';
      }).join('');
      return header + rows;
    }).join('');

    document.getElementById('category-picker-list').innerHTML = html || '<div style="padding:20px; text-align:center; opacity:0.5;">등록된 항목이 없습니다</div>';
    document.getElementById('category-picker-modal').classList.add('active');
  },

  selectCategoryFromPicker: function(idx) {
    var name = this._categoryPickerList[idx];
    var ctx = this._categoryPickerCtx;
    this.setCategoryPickerValue(ctx.valueId, ctx.labelId, name);
    this.closeCategoryPicker();
  },

  openLiabilityPicker: function() {
    var liabs = this.db.data.assetEntries.filter(function(a) { return a.type === 'liability'; });
    this._liabilityPickerList = liabs;
    var html = liabs.map(function(l, idx) {
      return '<div class="cat-picker-row" onclick="app.selectLiabilityFromPicker(' + idx + ')">' + app.escapeHtml(l.category_name) + ' <span style="opacity:0.6; font-size:12px;">(잔액 ' + l.amount.toLocaleString() + '원)</span></div>';
    }).join('');
    document.getElementById('category-picker-list').innerHTML = html || '<div style="padding:20px; text-align:center; opacity:0.5;">등록된 부채가 없습니다</div>';
    document.getElementById('category-picker-modal').classList.add('active');
  },

  selectLiabilityFromPicker: function(idx) {
    var l = this._liabilityPickerList[idx];
    if (!l) return;
    this.setLiabilityPickerValue(l.id);
    this.closeCategoryPicker();
  },

  closeCategoryPicker: function() {
    var m = document.getElementById('category-picker-modal');
    if (m) m.classList.remove('active');
  },

  setCategoryPickerValue: function(valueId, labelId, name) {
    var valueEl = document.getElementById(valueId);
    if (valueEl) valueEl.value = name;
    var label = document.getElementById(labelId);
    if (label) {
      var parts = this.splitCategory(name);
      label.textContent = name ? (parts.minor ? (parts.major + ' - ' + parts.minor) : name) : '항목 선택';
    }
  },

  setLiabilityPickerValue: function(liabilityId) {
    var l = this.db.data.assetEntries.filter(function(x) { return x.id === liabilityId; })[0];
    var valueEl = document.getElementById('in-liability');
    if (valueEl) valueEl.value = liabilityId || '';
    var label = document.getElementById('in-liability-label');
    if (label) label.textContent = l ? (l.category_name + ' (잔액 ' + l.amount.toLocaleString() + '원)') : '부채 선택';
  },

  save: function() { localStorage.setItem(this.db.mainKey, JSON.stringify(this.db.data)); },

  apply: function() {
    document.body.className = this.db.data.settings.theme + "-mode";
    var uName = document.getElementById('user-display-name');
    if (uName) uName.textContent = this.db.data.settings.userName;
    var uIn = document.getElementById('in-user-name');
    if (uIn) uIn.value = this.db.data.settings.userName;
    var sTh = document.getElementById('set-theme');
    if (sTh) sTh.value = this.db.data.settings.theme;
  },

  render: function() {
    this.renderCalendar();
    this.renderDailyList();
    this.renderSummary();
  },

  moveMonth: function(n) {
    this.currentDate.setMonth(this.currentDate.getMonth() + n);
    this.render();
  },

  changeTab: function(t) {
    document.querySelectorAll('.top-tab').forEach(function(el){ el.classList.toggle('active', el.id==='tab-'+t); });
    document.querySelectorAll('.tab-panel').forEach(function(el){ el.classList.toggle('active', el.id==='panel-'+t); });
    var fab = document.getElementById('btn-open-add'); if(fab) fab.style.display = (t==='entry'?'flex':'none');
    // 설정 탭에서 템플릿을 추가/적용하고 돌아왔을 때 오늘 칸의 반복거래 마감 표시가 바로 반영되도록 다시 그린다.
    if(t==='entry') this.renderCalendar();
    if(t==='search') this.initSearch();
    if(t==='analysis') this.renderAnalysis();
    if(t==='bs') { var b=document.getElementById('bs-date'); if(b) b.value=this.selectedDate; }
    if(t==='is') this.setISPeriod('month');
    if(t==='settings') {
      this.renderCategoryChips();
      this.renderTemplateCategoryOptions();
      this.renderTemplateList();
      this.renderMemoSuggestions();
    }
  },

  renderCalendar: function() {
    var cont = document.getElementById('cal-container'); if(!cont) return;
    var y = this.currentDate.getFullYear(), m = this.currentDate.getMonth();
    var first = new Date(y, m, 1).getDay(), last = new Date(y, m + 1, 0).getDate();
    var days = ['일','월','화','수','목','금','토'];
    var html = '<table class="cal-table"><thead><tr>';
    for (var i=0; i<7; i++) html += '<th>'+days[i]+'</th>';
    html += '</tr></thead><tbody><tr>';
    for (var j=0; j<first; j++) html += '<td></td>';
    
    var today = this.fmtDate(new Date());
    var all = this.db.data.transactions.concat(this.db.data.assetEntries);
    var showPendingDot = this.hasPendingTemplateToday();

    for (var d=1; d<=last; d++) {
      if ((first + d - 1) % 7 === 0 && d > 1) html += '</tr><tr>';
      var dStr = y + "-" + String(m+1).padStart(2,'0') + "-" + String(d).padStart(2,'0');
      var cls = '';
      if (dStr === today) { cls += 'today'; if (showPendingDot) cls += ' tpl-pending'; }
      if (dStr === this.selectedDate) cls += ' selected';
      if (all.some(function(t){return t.date === dStr;})) cls += ' has-tx';
      html += '<td class="'+cls+'" onclick="app.selectDate(\''+dStr+'\')">'+d+'</td>';
    }
    html += '</tr></tbody></table>';
    cont.innerHTML = html;
    var tt = document.getElementById('cal-title'); if(tt) tt.textContent = y + "년 " + (m+1) + "월";
  },

  selectDate: function(d) { this.selectedDate = d; this.render(); },

  renderDailyList: function() {
    var cont = document.getElementById('daily-tx-list'); if(!cont) return;
    var txs = this.db.data.transactions.concat(this.db.data.assetEntries).filter(function(t){ return t.date === app.selectedDate; });
    if(txs.length === 0) { cont.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.3;">내역 없음</div>'; }
    else {
      var h = '';
      txs.forEach(function(t) {
        var isP = (t.type==='income'||t.type==='asset');
        var icon = isP ? '💰' : (t.type === 'debt_payment' ? '🏦' : '💸');
        var badge = '';
        var amountColor = isP ? 'var(--income)' : 'var(--expense)';
        var amountPrefix = isP ? '+' : '-';
        if (t.type === 'debt_payment') badge = ' <span class="chip" style="font-size:9px; padding:2px 6px;">부채상환</span>';
        // 재평가 기록은 실제 그날 돈이 오간 게 아니라 "값을 갱신한 것"이라, 수입/지출처럼 보이지 않도록 색과 부호를 다르게 표시한다.
        if (t.isRevaluation) {
          icon = '📝';
          badge = ' <span class="chip" style="font-size:9px; padding:2px 6px; background:rgba(99,102,241,0.15); color:var(--primary);">재평가</span>';
          amountColor = 'var(--primary)';
          amountPrefix = '';
        }
        var label = app.escapeHtml(t.category_name) + badge;
        h += '<div class="list-item" onclick="app.openModalById('+t.id+',\''+t.type+'\')"><div class="list-icon">'+icon+'</div><div class="list-body"><div class="list-main"><span>'+label+'</span><span style="color:'+amountColor+'">'+amountPrefix+t.amount.toLocaleString()+'</span></div><div class="list-sub">'+app.escapeHtml(t.payment_method||'기타')+(t.memo?(' · '+app.escapeHtml(t.memo)):'')+'</div></div></div>';
      });
      cont.innerHTML = h;
    }
    var tit = document.getElementById('daily-tx-list-title'); if(tit) tit.textContent = this.selectedDate + " 내역";
  },

  renderSummary: function() {
    var y=this.currentDate.getFullYear(), m=this.currentDate.getMonth(), inc=0, exp=0;
    this.db.data.transactions.forEach(function(t){var d=new Date(t.date); if(d.getFullYear()===y && d.getMonth()===m){if(t.type==='income')inc+=t.amount; else if(t.type==='expense') exp+=t.amount;}});
    var iE=document.getElementById('sum-inc'), eE=document.getElementById('sum-exp'), nE=document.getElementById('sum-net');
    if(iE) iE.textContent=inc.toLocaleString(); if(eE) eE.textContent=exp.toLocaleString(); if(nE) nE.textContent=(inc-exp).toLocaleString();
  },

  openModalById: function(id, type) {
    var coll = (type === 'asset' || type === 'liability') ? this.db.data.assetEntries : this.db.data.transactions;
    var item = null;
    for (var i = 0; i < coll.length; i++) { if (coll[i].id === id) { item = coll[i]; break; } }
    if (item) this.openModal(item);
  },

  openModal: function(data) {
    this.editingId = data ? data.id : null;
    this.editingColl = data ? ((data.type === 'asset' || data.type === 'liability') ? 'asset' : 'tx') : null;
    this._applyingTemplateIdx = null;
    var t = data ? data.type : 'expense';
    this.setModalType(t);
    document.getElementById('in-date').value = data ? data.date : this.selectedDate;
    document.getElementById('in-amount').value = data ? data.amount.toLocaleString() : "";
    document.getElementById('in-payment').value = data ? (data.payment_method||'카드') : '카드';
    document.getElementById('in-memo').value = data ? (data.memo||'') : '';
    document.getElementById('btn-delete').style.display = data ? 'block' : 'none';
    if (data) {
      if (t === 'debt_payment') {
        this.setLiabilityPickerValue(data.liabilityId);
      } else {
        this.setCategoryPickerValue('in-category', 'in-category-label', data.category_name);
      }
    }
    document.getElementById('tx-modal').classList.add('active');
  },

  closeModal: function() { document.getElementById('tx-modal').classList.remove('active'); this._applyingTemplateIdx = null; },
  setModalType: function(t) {
    this.modalType = t;
    document.querySelectorAll('.type-sel').forEach(function(el){ el.classList.toggle('active', el.id==='btn-type-'+t); });
    var catDisplay = document.getElementById('in-category-display');
    var liabDisplay = document.getElementById('in-liability-display');
    if (t === 'debt_payment') {
      if (catDisplay) catDisplay.style.display = 'none';
      if (liabDisplay) {
        liabDisplay.style.display = 'flex';
        var liabs = this.db.data.assetEntries.filter(function(a){ return a.type === 'liability'; });
        this.setLiabilityPickerValue(liabs[0] ? liabs[0].id : null);
      }
    } else {
      if (catDisplay) {
        catDisplay.style.display = 'flex';
        this.setCategoryPickerValue('in-category', 'in-category-label', this.db.data.categories[t][0] || '');
      }
      if (liabDisplay) liabDisplay.style.display = 'none';
    }
  },

  handleSave: function() {
    var a = parseInt(document.getElementById('in-amount').value.replace(/[^0-9]/g,'')); if(!a){alert("금액 입력");return;}

    if (this.modalType === 'debt_payment') {
      this.handleSaveDebtPayment(a);
      return;
    }

    var e = { id:this.editingId||Date.now(), type:this.modalType, date:document.getElementById('in-date').value, category_name:document.getElementById('in-category').value, amount:a, payment_method:document.getElementById('in-payment').value, memo:document.getElementById('in-memo').value };
    var newColl = (this.modalType === 'asset' || this.modalType === 'liability') ? this.db.data.assetEntries : this.db.data.transactions;

    if (this.editingId) {
      // [버그 수정] 수정 중 타입을 바꿔서(예: 지출 -> 자산) 소속 배열 자체가 바뀌는 경우,
      // 예전엔 새 배열에서 같은 id를 못 찾아 그냥 새로 추가만 하고 원래 배열의 항목은 그대로 남아
      // "수정했는데 원본은 안 지워지고 중복만 생기는" 버그가 있었다.
      var oldColl = this.editingColl === 'asset' ? this.db.data.assetEntries : this.db.data.transactions;
      var oi = oldColl.findIndex(function(x){ return x.id === app.editingId; });
      var old = oi !== -1 ? oldColl[oi] : null;

      // 예전에 부채상환 거래였다면 타입이 바뀌는 것이므로, 부채 잔액에 줬던 영향을 먼저 되돌린다.
      if (old && old.type === 'debt_payment') {
        var oldLiability = this.db.data.assetEntries.filter(function(l){ return l.id === old.liabilityId; })[0];
        if (oldLiability) oldLiability.amount += old.amount;
      }

      if (oldColl === newColl) {
        if (oi !== -1) oldColl[oi] = e; else newColl.push(e);
      } else {
        if (oi !== -1) oldColl.splice(oi, 1);
        newColl.push(e);
      }
    } else {
      newColl.push(e);
    }

    // 반복거래 템플릿의 "입력하기" 버튼으로 열어서 저장한 경우, 그 템플릿을 이번 달 반영 처리한다.
    var linkedTplIdx = this._applyingTemplateIdx;
    if (linkedTplIdx != null && this.db.data.templates[linkedTplIdx]) {
      this.db.data.templates[linkedTplIdx].lastAppliedMonth = this.fmtDate(new Date()).slice(0, 7);
    }

    this.save(); this.closeModal(); this.render();

    if (linkedTplIdx != null) { this.renderTemplateList(); this.updateTemplateBadge(); }
  },

  // 부채상환: 손익(지출)에 잡히지 않고, 대신 assetEntries의 해당 부채 잔액을 직접 차감한다.
  handleSaveDebtPayment: function(amount) {
    var liabilityId = Number(document.getElementById('in-liability').value);
    var liability = this.db.data.assetEntries.filter(function(l){ return l.id === liabilityId; })[0];
    if (!liability) { alert("상환할 부채를 선택하세요"); return; }

    if (this.editingId) {
      // 수정 전 원본이 어느 배열에 있었는지 editingColl로 정확히 찾는다 (지출/자산 등에서 부채상환으로 타입을 바꾸는 경우 대비)
      var oldColl = this.editingColl === 'asset' ? this.db.data.assetEntries : this.db.data.transactions;
      var oi = oldColl.findIndex(function(x){ return x.id === app.editingId; });
      var old = oi !== -1 ? oldColl[oi] : null;

      // 기존에 반영했던 상환액을 부채 잔액에 먼저 되돌린 뒤 다시 차감한다.
      if (old && old.type === 'debt_payment') {
        var oldLiability = this.db.data.assetEntries.filter(function(l){ return l.id === old.liabilityId; })[0];
        if (oldLiability) oldLiability.amount += old.amount;
        liability = this.db.data.assetEntries.filter(function(l){ return l.id === liabilityId; })[0];
      }

      // 원본이 transactions가 아닌 다른 배열(자산/부채)에 있었다면 거기서 제거 (부채상환은 항상 transactions에 저장되므로)
      if (oi !== -1 && oldColl !== this.db.data.transactions) {
        oldColl.splice(oi, 1);
      }
    }

    liability.amount = Math.max(0, liability.amount - amount);

    var e = {
      id: this.editingId || Date.now(), type: 'debt_payment', date: document.getElementById('in-date').value,
      liabilityId: liability.id, category_name: liability.category_name, amount: amount,
      payment_method: document.getElementById('in-payment').value, memo: document.getElementById('in-memo').value
    };
    if (this.editingId && this.editingColl === 'tx') {
      // 원본이 이미 transactions 안에 있던 경우(지출/수입/부채상환 -> 부채상환)만 같은 배열 안에서 안전하게 in-place 교체 가능.
      var i = this.db.data.transactions.findIndex(function(x){ return x.id === app.editingId; });
      if (i !== -1) this.db.data.transactions[i] = e; else this.db.data.transactions.push(e);
    } else {
      // [버그 수정] 원본이 자산/부채 배열에 있었다면(위에서 이미 제거함) 여기서 새로 추가만 한다.
      // id가 자산/부채 쪽과 거래 쪽에서 우연히 겹칠 수 있어(예: 둘 다 id=1), transactions에서 같은 id를 찾아
      // 덮어쓰면 완전히 무관한 거래가 사라질 위험이 있었다.
      this.db.data.transactions.push(e);
    }
    this.save(); this.closeModal(); this.render();
  },

  handleDelete: function() {
    if (confirm("삭제?")) {
      if (this.editingColl === 'asset') {
        // [버그 수정] transactions와 assetEntries가 id를 공유할 수 있어(예: 둘 다 id=1),
        // 예전엔 양쪽 배열을 무조건 같이 필터링해서 엉뚱한 항목이 같이 삭제될 위험이 있었다.
        this.db.data.assetEntries = this.db.data.assetEntries.filter(function(x){ return x.id !== app.editingId; });
      } else {
        var target = this.db.data.transactions.filter(function(x){ return x.id === app.editingId; })[0];
        if (target && target.type === 'debt_payment') {
          var liability = this.db.data.assetEntries.filter(function(l){ return l.id === target.liabilityId; })[0];
          if (liability) liability.amount += target.amount;
        }
        this.db.data.transactions = this.db.data.transactions.filter(function(x){ return x.id !== app.editingId; });
      }
      this.save(); this.closeModal(); this.render();
    }
  },
  saveUserName: function(){ var v=document.getElementById('in-user-name').value; if(v){this.db.data.settings.userName=v;this.save();this.apply();}},
  saveTheme: function(v){ this.db.data.settings.theme=v;this.save();this.apply();},
  addCategory: function(){ var t=document.getElementById('cat-type-select').value, n=document.getElementById('cat-name-input').value.trim(); if(n){this.db.data.categories[t].push(n);this.save();this.renderCategoryChips();document.getElementById('cat-name-input').value="";}},
  removeCategory: function(t, idx) {
    var n = this.db.data.categories[t][idx];
    if(n !== undefined && confirm('[' + n + '] 항목을 삭제하시겠습니까?')) {
      this.db.data.categories[t].splice(idx, 1);
      this.save();
      this.renderCategoryChips();
    }
  },

  // 카테고리 이름 변경. 과거 거래/자산/반복거래 템플릿의 category_name도 함께 바꿔서 이력이 끊기지 않게 한다.
  renameCategory: function(t, idx, newName) {
    var oldName = this.db.data.categories[t][idx];
    if (!oldName || !newName || oldName === newName) return;
    this.db.data.categories[t][idx] = newName;
    this.db.data.transactions.forEach(function(x) { if (x.category_name === oldName) x.category_name = newName; });
    this.db.data.assetEntries.forEach(function(x) { if (x.category_name === oldName) x.category_name = newName; });
    this.db.data.templates.forEach(function(x) { if (x.category_name === oldName) x.category_name = newName; });
    this.save();
    this.render();
    this.renderCategoryChips();
  },

  promptRenameCategory: function(t, idx) {
    var oldName = this.db.data.categories[t][idx];
    if (oldName === undefined) return;
    var newName = prompt("새 이름 (대분류-소분류 형식 가능, 예: 교통비-대중교통):", oldName);
    if (!newName) return;
    newName = newName.trim();
    if (!newName) return;
    this.renameCategory(t, idx, newName);
  },

  renderCategoryChips: function(){
    var t=document.getElementById('cat-type-select').value, c=document.getElementById('cat-chips-container');
    if(!c) return;
    var cats = this.db.data.categories[t];
    // 대분류-소분류 컨벤션에 맞춰 대분류별로 묶어서 표시한다 (삭제/이름변경은 원본 배열 인덱스 기준으로 동작).
    var groups = {}, order = [];
    cats.forEach(function(name, idx) {
      var major = app.splitCategory(name).major;
      if (!groups[major]) { groups[major] = []; order.push(major); }
      groups[major].push({ name: name, idx: idx });
    });
    c.innerHTML = order.map(function(major) {
      var items = groups[major];
      var chips = items.map(function(it) {
        var minor = app.splitCategory(it.name).minor;
        var label = items.length > 1 ? (minor || '(기본)') : it.name;
        return '<div class="chip"><span onclick="app.promptRenameCategory(\''+t+'\','+it.idx+')" style="cursor:pointer;">'+app.escapeHtml(label)+'</span><div class="chip-del" onclick="app.removeCategory(\''+t+'\','+it.idx+')">×</div></div>';
      }).join('');
      var heading = items.length > 1 ? '<div style="width:100%; font-size:10px; font-weight:900; color:var(--text-sub); margin:8px 0 4px;">'+app.escapeHtml(major)+'</div>' : '';
      return heading + '<div style="width:100%; display:flex; flex-wrap:wrap; gap:8px;">' + chips + '</div>';
    }).join('');
  },

  // ===================== 🔁 반복거래 템플릿 =====================
  renderTemplateCategoryOptions: function() {
    var typeSel = document.getElementById('tpl-type');
    if (!typeSel) return;
    var t = typeSel.value;
    this.setCategoryPickerValue('tpl-category', 'tpl-category-label', this.db.data.categories[t][0] || '');
  },

  addTemplate: function() {
    var type = document.getElementById('tpl-type').value;
    var category_name = document.getElementById('tpl-category').value;
    var amountRaw = document.getElementById('tpl-amount').value.replace(/[^0-9]/g, '');
    // 금액을 비워두면 "매달 금액이 바뀌는 항목"(관리비 등)으로 등록되어, 일괄 자동적용 대신 매달 직접 입력하도록 안내한다.
    var amount = amountRaw ? parseInt(amountRaw) : null;
    var payment_method = document.getElementById('tpl-payment').value;
    var day = parseInt(document.getElementById('tpl-day').value) || new Date().getDate();
    var memo = document.getElementById('tpl-memo').value.trim();
    if (!category_name) { alert("항목을 선택하세요"); return; }
    day = Math.min(Math.max(day, 1), 31);

    this.db.data.templates.push({
      id: Date.now(), type: type, category_name: category_name, amount: amount,
      payment_method: payment_method, memo: memo, day: day, lastAppliedMonth: null
    });
    this.save();
    document.getElementById('tpl-amount').value = '';
    document.getElementById('tpl-memo').value = '';
    this.renderTemplateList();
    this.updateTemplateBadge();
  },

  removeTemplate: function(idx) {
    var tpl = this.db.data.templates[idx];
    if (tpl && confirm('[' + tpl.category_name + '] 반복거래 템플릿을 삭제하시겠습니까?')) {
      this.db.data.templates.splice(idx, 1);
      this.save();
      this.renderTemplateList();
      this.updateTemplateBadge();
    }
  },

  // 금액이 매달 바뀌는 템플릿("금액 매달 다름")을 이번 달 것으로 채워 넣기 위해,
  // 거래입력 모달을 항목/결제수단/메모만 미리 채운 채로 열고 금액은 사용자가 직접 입력하게 한다.
  applyTemplateManually: function(idx) {
    var tpl = this.db.data.templates[idx];
    if (!tpl) return;
    this.openModal();
    this.setModalType(tpl.type);
    this.setCategoryPickerValue('in-category', 'in-category-label', tpl.category_name);
    document.getElementById('in-payment').value = tpl.payment_method;
    document.getElementById('in-memo').value = tpl.memo || '';
    document.getElementById('in-amount').value = '';
    var today = new Date();
    var lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    var day = Math.min(tpl.day || today.getDate(), lastDay);
    document.getElementById('in-date').value = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    this._applyingTemplateIdx = idx;
  },

  renderTemplateList: function() {
    var cont = document.getElementById('tpl-list-container'); if (!cont) return;
    var ym = this.fmtDate(new Date()).slice(0, 7);
    var templates = this.db.data.templates;
    if (templates.length === 0) { cont.innerHTML = '<div style="padding:12px 0; opacity:0.5; font-size:12px;">등록된 반복거래가 없습니다.</div>'; return; }
    cont.innerHTML = templates.map(function(t, idx) {
      var applied = t.lastAppliedMonth === ym;
      var isP = (t.type === 'income' || t.type === 'asset');
      var isVariable = !t.amount;
      var amountText = isVariable ? '금액 매달 다름' : (t.amount.toLocaleString() + '원');
      var actionBtn = (!applied && isVariable) ? '<button class="btn-outline" style="padding:6px 10px; font-size:11px; margin-left:8px; flex-shrink:0;" onclick="app.applyTemplateManually(' + idx + ')">입력</button>' : '';
      return '<div class="list-item" style="padding:10px 0;">' +
        '<div class="list-body">' +
        '<div class="list-main"><span>' + app.escapeHtml(t.category_name) + '</span>' +
        '<span style="color:' + (isP ? 'var(--income)' : 'var(--expense)') + '">' + amountText + '</span></div>' +
        '<div class="list-sub">매월 ' + t.day + '일 · ' + app.escapeHtml(t.payment_method) + (applied ? ' · <span style="color:var(--income);">이번달 반영됨</span>' : ' · <span style="color:var(--expense);">이번달 미반영</span>') + '</div>' +
        '</div>' +
        actionBtn +
        '<div class="chip-del" style="margin-left:8px;" onclick="app.removeTemplate(' + idx + ')">×</div>' +
        '</div>';
    }).join('');
  },

  applyTemplates: function(confirmFirst) {
    var ym = this.fmtDate(new Date()).slice(0, 7);
    var allPending = this.db.data.templates.filter(function(t) { return t.lastAppliedMonth !== ym; });
    // 금액이 정해진 것만 자동 일괄 적용 가능. 매달 금액이 바뀌는 것은 목록에서 "입력" 버튼으로 개별 처리한다.
    var pending = allPending.filter(function(t) { return t.amount; });
    var variableCount = allPending.length - pending.length;

    if (pending.length === 0) {
      if (confirmFirst) {
        if (variableCount > 0) alert("자동 적용할 항목은 없습니다.\n금액이 매달 바뀌는 " + variableCount + "건은 목록에서 [입력] 버튼으로 직접 입력해주세요.");
        else alert("이번 달에 적용할 반복거래가 없습니다.");
      }
      return;
    }
    if (confirmFirst) {
      var list = pending.map(function(t) { return '- ' + t.category_name + ' ' + t.amount.toLocaleString() + '원'; }).join('\n');
      var extra = variableCount > 0 ? ('\n\n(금액이 매달 바뀌는 ' + variableCount + '건은 목록에서 [입력] 버튼으로 따로 입력해주세요)') : '';
      if (!confirm(pending.length + '건의 반복거래를 이번 달(' + ym + ')에 등록합니다:\n\n' + list + extra)) return;
    }
    var today = new Date();
    var lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    pending.forEach(function(t, i) {
      var day = Math.min(t.day || today.getDate(), lastDay);
      var date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(day).padStart(2, '0');
      var entry = { id: Date.now() + i, type: t.type, date: date, category_name: t.category_name, amount: t.amount, payment_method: t.payment_method, memo: t.memo || '' };
      var coll = (t.type === 'asset' || t.type === 'liability') ? app.db.data.assetEntries : app.db.data.transactions;
      coll.push(entry);
      t.lastAppliedMonth = ym;
    });
    this.save();
    this.render();
    this.renderTemplateList();
    this.updateTemplateBadge();
    if (confirmFirst) alert(pending.length + "건 등록 완료!");
  },

  // 등록된 날짜가 지났는데 아직 이번 달 것을 안 넣은 템플릿만 "마감 지남"으로 취급한다.
  // (날짜가 되기 전부터 미리 재촉하지 않기 위함 — 예: 25일 항목이면 1~24일엔 조용히 있다가 25일부터 표시)
  getDueUnappliedTemplates: function() {
    var ym = this.fmtDate(new Date()).slice(0, 7);
    var todayDay = new Date().getDate();
    return this.db.data.templates.filter(function(t) { return t.lastAppliedMonth !== ym && todayDay >= t.day; });
  },

  hasPendingTemplateToday: function() {
    return this.getDueUnappliedTemplates().length > 0;
  },

  updateTemplateBadge: function() {
    var dueCount = this.getDueUnappliedTemplates().length;
    var tab = document.getElementById('tab-settings');
    if (tab) tab.innerHTML = dueCount > 0 ? ('⚙️ 설정 <span class="badge-dot">' + dueCount + '</span>') : '⚙️ 설정';
  },

  // ===================== 🔍 메모 반복 감지 → 항목명 승격 =====================
  _memoSuggestions: [],

  detectRecurringMemos: function() {
    var groups = {};
    function normalize(m) {
      return String(m || '').replace(/[0-9]/g, '').replace(/[\s.,·\-]/g, '');
    }
    this.db.data.transactions.forEach(function(t) {
      var norm = normalize(t.memo);
      if (!norm || norm.length < 2) return;
      var key = t.type + '|' + norm;
      if (!groups[key]) groups[key] = { items: [], norm: norm, type: t.type };
      groups[key].items.push(t);
    });
    var suggestions = [];
    Object.keys(groups).forEach(function(k) {
      var g = groups[k];
      if (g.items.length < 3) return;
      // 이미 전부 같은 카테고리로 통합돼 있으면(예전에 승격 완료) 다시 제안하지 않는다.
      // (카테고리명이 메모 텍스트와 문자 그대로 같은지가 아니라, "이미 한 카테고리로 뭉쳤는지"를 기준으로 판단)
      var uniqueCats = {};
      g.items.forEach(function(it) { uniqueCats[it.category_name] = true; });
      if (Object.keys(uniqueCats).length === 1) return;
      var sample = g.items[g.items.length - 1];
      suggestions.push({ type: g.type, sampleMemo: sample.memo, sampleCategory: sample.category_name, count: g.items.length, items: g.items });
    });
    suggestions.sort(function(a, b) { return b.count - a.count; });
    return suggestions;
  },

  renderMemoSuggestions: function() {
    var card = document.getElementById('memo-suggestion-card'), list = document.getElementById('memo-suggestion-list');
    if (!card || !list) return;
    this._memoSuggestions = this.detectRecurringMemos();
    if (this._memoSuggestions.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    list.innerHTML = this._memoSuggestions.map(function(s, idx) {
      return '<div class="list-item" style="padding:10px 0;">' +
        '<div class="list-body">' +
        '<div class="list-main"><span>' + app.escapeHtml(s.sampleMemo) + '</span><span class="chip">' + s.count + '건</span></div>' +
        '<div class="list-sub">현재 [' + app.escapeHtml(s.sampleCategory) + ']에 섞여 기록됨</div>' +
        '</div>' +
        '<button class="btn-outline" style="padding:6px 10px; font-size:11px; margin-left:8px;" onclick="app.promoteMemoToCategory(' + idx + ')">전용 항목화</button>' +
        '</div>';
    }).join('');
  },

  promoteMemoToCategory: function(idx) {
    var s = this._memoSuggestions[idx];
    if (!s) return;
    var suggested = s.sampleCategory + '-' + String(s.sampleMemo || '').trim();
    var name = prompt("이 " + s.count + "건을 통합할 새 항목(대분류-소분류) 이름을 입력하세요:", suggested);
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (this.db.data.categories[s.type].indexOf(name) === -1) this.db.data.categories[s.type].push(name);
    s.items.forEach(function(t) { t.category_name = name; });
    this.save();
    this.render();
    this.renderCategoryChips();
    this.renderMemoSuggestions();
    alert("'" + name + "' 항목으로 " + s.items.length + "건을 통합했습니다.");
  },
  exportData: async function() {
    var dataStr = JSON.stringify(this.db.data, null, 2);
    var ts = new Date().toISOString().slice(0, 10);
    var fileName = 'gaegyebu_backup_' + ts + '.json';

    // 1순위: Capacitor Filesystem → Documents 폴더 (권한 불필요, 항상 동작)
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        var FS = window.Capacitor.Plugins.Filesystem;
        await FS.writeFile({
          path: fileName,
          data: dataStr,
          directory: 'DOCUMENTS',
          encoding: 'utf8',
          recursive: true
        });
        alert('✅ 백업 파일 저장 완료!\n📁 파일명: ' + fileName + '\n📂 위치: 내 파일 > 내부저장소 > Android > data > [앱] > files > Documents');
        return;
      }
    } catch(fsErr) {
      console.warn('Filesystem 저장 실패, Share API 시도:', fsErr.message || fsErr);
    }

    // 2순위: Web Share API + File
    try {
      if (navigator.share) {
        var blob = new Blob([dataStr], { type: 'application/json' });
        var file = new File([blob], fileName, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '가계부 백업 파일' });
          return;
        }
      }
    } catch(shareErr) {
      console.warn('Share API 실패:', shareErr.message || shareErr);
    }

    // 3순위: 파일 다운로드 (웹 표준 — PC 브라우저에서는 이게 정상 경로다)
    // 예전에는 이 단계가 없어서 PC에서 백업하면 파일 대신 클립보드로만
    // 복사됐다. 가계부는 기록을 잃으면 복구할 방법이 없으므로 실제 파일로
    // 받아둘 수 있어야 한다.
    try {
      var url = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      alert('✅ 백업 파일을 내려받았습니다.\n📁 ' + fileName + '\n(브라우저의 다운로드 폴더를 확인하세요)');
      return;
    } catch(dlErr) {
      console.warn('다운로드 실패, 클립보드 시도:', dlErr.message || dlErr);
    }

    // 4순위: 클립보드 폴백
    this.fallbackCopy(dataStr);
  },
  
  fallbackCopy: function(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert('✅ 백업 데이터가 클립보드에 복사되었습니다 (호환 모드).\n메모장 등에 붙여넣어 보관하세요.');
    } catch (err) {
      alert('❌ 클립보드 복사에 실패했습니다. 데이터를 수동으로 복사해주세요:\n' + text.substring(0, 100) + '...');
    }
    document.body.removeChild(textArea);
  },

  importData: function(i){
    if(!i.files[0]) return;
    var fileInput = i;
    var reset = function(){ try { fileInput.value = ''; } catch(_){} };
    var r = new FileReader();
    r.onerror = function(){ alert('❌ 파일을 읽지 못했습니다. 다시 시도해 주세요.'); reset(); };
    r.onload = function(e){
      var d;
      try {
        d = JSON.parse(e.target.result);
      } catch(x) {
        alert('❌ 백업 파일을 읽을 수 없습니다.\n가계부에서 내보낸 .json 파일이 맞는지 확인해 주세요.');
        reset(); return;
      }

      // 가계부 백업이 맞는지 확인한다. 예전에는 아무 JSON이나 그대로 받아들여서
      // 엉뚱한 파일을 골라도 "복구 성공"이라고 알렸다.
      if (!d || typeof d !== 'object' || !Array.isArray(d.transactions)) {
        alert('❌ 가계부 백업 파일이 아닙니다.\n(거래 내역을 찾을 수 없습니다)');
        reset(); return;
      }

      var nNew = d.transactions.length;
      var nCur = (app.db.data.transactions || []).length;

      // 복구는 지금 기록을 덮어쓴다. 예전에는 확인 한 번 없이 즉시 바꿔서
      // 파일을 잘못 고르면 가계부가 통째로 사라졌다.
      if (!confirm('복구하면 지금 기록이 백업 파일 내용으로 바뀝니다.\n\n현재: 거래 ' + nCur + '건\n백업본: 거래 ' + nNew + '건\n\n진행할까요?')) {
        reset(); return;
      }

      // 잘못 복구했을 때를 대비해 직전 상태를 따로 남긴다.
      try {
        localStorage.setItem(app.db.mainKey + '_before_restore', JSON.stringify(app.db.data));
      } catch(_){}

      // 기본 구조 위에 파일 내용을 얹는다. 파일에 없는 항목은 기존 값을 유지한다.
      app.db.data = Object.assign({
        transactions: [], assetEntries: [], templates: [],
        categories: app.db.data.categories, settings: app.db.data.settings
      }, d);
      app.save();
      alert('✅ 복구 완료 — 거래 ' + nNew + '건을 불러왔습니다.');
      location.reload();
    };
    r.readAsText(i.files[0]);
  },
  setAnalysisPeriod: function(p){ 
    var end=new Date(), start=new Date(); 
    if(p==='month')start.setDate(1);
    else if(p==='last'){start.setMonth(start.getMonth()-1);start.setDate(1);end.setDate(0);}
    else if(p==='year')start.setMonth(0,1);
    else if(p==='3m')start.setMonth(start.getMonth()-3); 
    document.getElementById('ana-start').value=this.fmtDate(start); 
    document.getElementById('ana-end').value=this.fmtDate(end); 
    this.renderAnalysis(); 
  },
  // 지출 분석 전용 대분류 고정비 목록. 여기 없으면 전부 변동비로 취급한다.
  ANA_FIXED_MAJORS: ['아파트관리비', '휴대폰 통신비', '구독료', '정수기사용비', '자동차보험료', '재산세', '자동차세', '기타 공과금'],
  ANA_MATERIALITY_THRESHOLD: 30000,

  // 수입은 매달 거의 고정이라(근로소득/연금 등) 분석할 변동성이 없고, 실제로 조절 가능한 건 지출뿐이라
  // 분석 화면은 지출에만 집중한다. 대신 "얼마 썼다"가 아니라 "직전 같은 길이의 기간보다 어떻게 달라졌는지"를 보여준다.
  sumExpenseByMajor: function(startS, endS) {
    var map = {}, total = 0;
    this.db.data.transactions.forEach(function(t) {
      if (t.type !== 'expense') return;
      if (t.date < startS || t.date > endS) return;
      var major = app.splitCategory(t.category_name).major;
      map[major] = (map[major] || 0) + t.amount;
      total += t.amount;
    });
    return { map: map, total: total };
  },

  renderAnalysis: function() {
    var s = document.getElementById('ana-start').value, e = document.getElementById('ana-end').value;
    if (!s || !e) { this.setAnalysisPeriod('month'); return; }

    // 선택 기간과 똑같은 길이의 직전 기간을 계산 (예: 3개월 선택 시 바로 이전 3개월과 비교)
    var sDate = new Date(s), eDate = new Date(e);
    var lengthMs = eDate.getTime() - sDate.getTime();
    var prevEnd = new Date(sDate.getTime() - 86400000);
    var prevStart = new Date(prevEnd.getTime() - lengthMs);
    var prevS = this.fmtDate(prevStart), prevE = this.fmtDate(prevEnd);

    var cur = this.sumExpenseByMajor(s, e);
    var prev = this.sumExpenseByMajor(prevS, prevE);

    // 1. 헤드라인: 총 지출 + 직전 동일 기간 대비
    var totalEl = document.getElementById('ana-total');
    if (totalEl) totalEl.textContent = cur.total.toLocaleString() + '원';
    var badge = document.getElementById('ana-badge');
    var compareText = document.getElementById('ana-compare-text');
    if (prev.total > 0) {
      var pct = (cur.total - prev.total) / prev.total * 100;
      var up = pct >= 0;
      if (badge) {
        badge.style.display = 'inline-block';
        badge.textContent = (up ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + '%';
        badge.style.background = up ? 'rgba(251,113,133,0.15)' : 'rgba(16,185,129,0.15)';
        badge.style.color = up ? 'var(--expense)' : 'var(--income)';
      }
      if (compareText) compareText.textContent = '이전 기간(' + prevS + ' ~ ' + prevE + ') ' + prev.total.toLocaleString() + '원 대비';
    } else {
      if (badge) badge.style.display = 'none';
      if (compareText) compareText.textContent = '비교할 이전 기간 데이터가 없습니다';
    }

    // 2. 고정비 vs 변동비
    var fixedTotal = 0, varTotal = 0;
    var fixedMajors = this.ANA_FIXED_MAJORS;
    Object.keys(cur.map).forEach(function(major) {
      if (fixedMajors.indexOf(major) !== -1) fixedTotal += cur.map[major]; else varTotal += cur.map[major];
    });
    var fixedPct = cur.total > 0 ? Math.round(fixedTotal / cur.total * 100) : 0;
    var varPct = cur.total > 0 ? (100 - fixedPct) : 0;
    var barEl = document.getElementById('ana-fixed-var-bar');
    if (barEl) barEl.innerHTML = '<div style="width:' + fixedPct + '%; background:var(--primary);"></div><div style="width:' + varPct + '%; background:var(--expense);"></div>';
    var detailEl = document.getElementById('ana-fixed-var-detail');
    if (detailEl) detailEl.innerHTML =
      '<div><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--primary); margin-right:6px;"></span>고정비 <b>' + fixedTotal.toLocaleString() + '원</b> <span style="color:var(--text-sub);">(' + fixedPct + '%)</span></div>' +
      '<div><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--expense); margin-right:6px;"></span>변동비 <b>' + varTotal.toLocaleString() + '원</b> <span style="color:var(--text-sub);">(' + varPct + '%)</span></div>';

    // 3. 카테고리별 구성 (대분류 기준, 금액 큰 순)
    var sortedMajors = Object.keys(cur.map).sort(function(a, b) { return cur.map[b] - cur.map[a]; });
    var breakdownEl = document.getElementById('ana-category-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = sortedMajors.map(function(major) {
        var pct = cur.total > 0 ? (cur.map[major] / cur.total * 100) : 0;
        return '<div style="margin-bottom:10px;">' +
          '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>' + app.escapeHtml(major) + '</span><span style="font-weight:800;">' + cur.map[major].toLocaleString() + '원 · ' + pct.toFixed(0) + '%</span></div>' +
          '<div style="height:7px; background:var(--bg); border-radius:4px;"><div style="width:' + pct.toFixed(1) + '%; height:100%; background:var(--primary); border-radius:4px;"></div></div>' +
        '</div>';
      }).join('') || '<div style="padding:20px; text-align:center; opacity:0.5;">해당 기간 지출 내역이 없습니다</div>';
    }

    // 4. 눈에 띄는 변동 (전월 대비 X, 직전 동일 기간 대비 "변화 금액"이 일정 기준 이상인 것만)
    var allMajors = {};
    Object.keys(cur.map).forEach(function(m) { allMajors[m] = true; });
    Object.keys(prev.map).forEach(function(m) { allMajors[m] = true; });
    var threshold = this.ANA_MATERIALITY_THRESHOLD;
    var movers = Object.keys(allMajors).map(function(major) {
      var curAmt = cur.map[major] || 0, prevAmt = prev.map[major] || 0;
      var diff = curAmt - prevAmt;
      var pct = prevAmt > 0 ? (diff / prevAmt * 100) : (curAmt > 0 ? 100 : 0);
      return { major: major, curAmt: curAmt, prevAmt: prevAmt, diff: diff, pct: pct };
    }).filter(function(m) { return Math.abs(m.diff) >= threshold; })
      .sort(function(a, b) { return Math.abs(b.diff) - Math.abs(a.diff); })
      .slice(0, 5);

    var moversEl = document.getElementById('ana-movers');
    if (moversEl) {
      moversEl.innerHTML = movers.map(function(m) {
        var up = m.diff >= 0;
        return '<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">' +
          '<div><div style="font-size:13px; font-weight:700;">' + app.escapeHtml(m.major) + '</div><div style="font-size:10px; color:var(--text-sub);">' + m.prevAmt.toLocaleString() + '원 → ' + m.curAmt.toLocaleString() + '원</div></div>' +
          '<div style="background:' + (up ? 'rgba(251,113,133,0.15)' : 'rgba(16,185,129,0.15)') + '; color:' + (up ? 'var(--expense)' : 'var(--income)') + '; font-size:12px; font-weight:900; padding:4px 10px; border-radius:8px; flex-shrink:0; margin-left:8px;">' + (up ? '▲ ' : '▼ ') + Math.abs(m.pct).toFixed(0) + '%</div>' +
        '</div>';
      }).join('') || '<div style="padding:16px; text-align:center; opacity:0.5; font-size:12px;">눈에 띄는 변동이 없습니다</div>';
    }
  },

  initSearch: function(){ var s=document.getElementById('sch-start'); if(s && !s.value) this.setSearchPeriod('month'); },
  setSearchPeriod: function(p){ var end=new Date(), start=new Date(); if(p==='month')start.setDate(1);else if(p==='last'){start.setMonth(start.getMonth()-1);start.setDate(1);end.setDate(0);}else if(p==='year')start.setMonth(0,1);else if(p==='3m')start.setMonth(start.getMonth()-3); document.getElementById('sch-start').value=this.fmtDate(start); document.getElementById('sch-end').value=this.fmtDate(end); this.executeSearch(); },
  executeSearch: function(){
    var kw=document.getElementById('sch-keyword').value.toLowerCase(), s=document.getElementById('sch-start').value, e=document.getElementById('sch-end').value, t=document.getElementById('sch-type').value;
    var f = this.db.data.transactions.concat(this.db.data.assetEntries).filter(function(x){return (x.category_name.toLowerCase().indexOf(kw)!==-1||(x.memo||'').toLowerCase().indexOf(kw)!==-1)&&x.date>=s&&x.date<=e&&(t==='all'||x.type===t);}).sort(function(a,b){return b.date.localeCompare(a.date);});
    document.getElementById('sch-count').textContent=f.length+"건";
    document.getElementById('sch-result-list').innerHTML=f.map(function(x){var p=(x.type==='income'||x.type==='asset'); var icon = p?'💰':(x.type==='debt_payment'?'🏦':'💸'); return '<div class="list-item" onclick="app.openModalById('+x.id+',\''+x.type+'\')"><div class="list-icon">'+icon+'</div><div class="list-body"><div class="list-main"><span>'+app.escapeHtml(x.category_name)+'</span><span>'+x.amount.toLocaleString()+'</span></div><div class="list-sub">'+x.date+'</div></div></div>';}).join('');
  },
  setISPeriod: function(p){ var end=new Date(), start=new Date(); if(p==='month')start.setDate(1);else if(p==='last'){start.setMonth(start.getMonth()-1);start.setDate(1);end.setDate(0);}else if(p==='year')start.setMonth(0,1);else if(p==='3m')start.setMonth(start.getMonth()-3); document.getElementById('is-start').value=this.fmtDate(start); document.getElementById('is-end').value=this.fmtDate(end); },
  // ===================== ✏️ 자산/부채 재평가 =====================
  toggleRevalueList: function() {
    var card = document.getElementById('revalue-list-card');
    if (!card) return;
    var show = card.style.display === 'none' || !card.style.display;
    card.style.display = show ? 'block' : 'none';
    if (show) this.renderRevalueList();
  },

  renderRevalueList: function() {
    var cont = document.getElementById('revalue-list'); if (!cont) return;
    var today = this.fmtDate(new Date());
    var latestByGroup = this.getLatestAssetsByGroup(today);
    var items = Object.keys(latestByGroup).map(function(gid) { return latestByGroup[gid]; });
    items.sort(function(a, b) { return a.type === b.type ? b.amount - a.amount : (a.type === 'asset' ? -1 : 1); });
    cont.innerHTML = items.map(function(it) {
      var gid = it.groupId || it.id;
      var typeLabel = it.type === 'asset' ? '자산' : '부채';
      return '<div class="list-item" style="padding:12px 0; cursor:pointer;" onclick="app.openRevalueModal(' + gid + ')">' +
        '<div class="list-body">' +
        '<div class="list-main"><span>' + app.escapeHtml(it.category_name) + '</span><span>' + it.amount.toLocaleString() + '원</span></div>' +
        '<div class="list-sub">' + typeLabel + (it.memo ? (' · ' + app.escapeHtml(it.memo)) : '') + ' · ' + it.date + ' 기준</div>' +
        '</div></div>';
    }).join('') || '<div style="padding:20px; text-align:center; opacity:0.5;">등록된 자산/부채가 없습니다</div>';
  },

  openRevalueModal: function(groupId) {
    var today = this.fmtDate(new Date());
    var latestByGroup = this.getLatestAssetsByGroup(today);
    var cur = latestByGroup[groupId];
    if (!cur) return;
    this._revalueGroupId = groupId;
    this._revalueBase = cur;
    document.getElementById('revalue-modal-title').textContent = cur.category_name + (cur.memo ? (' · ' + cur.memo) : '') + ' 재평가';
    document.getElementById('revalue-modal-current').textContent = '현재값: ' + cur.amount.toLocaleString() + '원 (' + cur.date + ' 기준)';
    document.getElementById('revalue-date').value = today;
    document.getElementById('revalue-amount').value = cur.amount.toLocaleString();
    document.getElementById('revalue-modal').classList.add('active');
  },

  closeRevalueModal: function() {
    var m = document.getElementById('revalue-modal');
    if (m) m.classList.remove('active');
  },

  saveRevalue: function() {
    var base = this._revalueBase;
    if (!base) return;
    var newAmount = parseInt(document.getElementById('revalue-amount').value.replace(/[^0-9]/g, ''));
    var newDate = document.getElementById('revalue-date').value;
    if (!newAmount || !newDate) { alert("금액과 날짜를 입력하세요"); return; }

    var entry = {
      id: Date.now(), groupId: this._revalueGroupId, type: base.type,
      category_name: base.category_name, date: newDate, amount: newAmount,
      memo: base.memo || '', isRevaluation: true
    };
    this.db.data.assetEntries.push(entry);
    this.save();
    this.closeRevalueModal();

    var diff = newAmount - base.amount;
    var pct = base.amount > 0 ? (diff / base.amount * 100) : 0;
    alert(base.category_name + '\n' + base.amount.toLocaleString() + '원 → ' + newAmount.toLocaleString() + '원\n(' + (diff >= 0 ? '+' : '') + diff.toLocaleString() + '원, ' + (diff >= 0 ? '+' : '') + pct.toFixed(1) + '%)');

    this.renderRevalueList();
    this.renderBS();
    this.render(); // 거래입력 화면(달력/일별내역)에도 반영되도록
  },

  renderBS: function() {
    var dt = document.getElementById('bs-date').value;
    if(!dt) return;
    // 조회하기를 누르면 재평가 목록은 닫고 평소 조회 화면으로 돌아간다.
    var revalueCard = document.getElementById('revalue-list-card');
    if (revalueCard) revalueCard.style.display = 'none';
    // 같은 자산의 재평가 이력 중 기준일자 시점의 최신값만 골라서 쓴다 (합산이 아니라 갱신).
    var latestByGroup = this.getLatestAssetsByGroup(dt);
    var assets = Object.keys(latestByGroup).map(function(gid){ return latestByGroup[gid]; });
    var container = document.getElementById('bs-result-area');
    if (!container) return;

    // --- [회계 원칙] 유동성 배열 순서 정의 (핵심 키워드 순서가 곧 출력 순서) ---
    var GROUPS = [
      { id: "liq", title: "1. 유동자산", type: "asset", keywords: ["현금","예금","CMA","MMF","주식","ETF","채권"] },
      { id: "tan", title: "2. 유형자산", type: "asset", keywords: ["보험","아파트","재건축","오피스텔","상가","귀금속","회원권","자동차","가전","부동산"] },
      { id: "cur", title: "1. 유동부채", type: "liability", keywords: ["카드","유동","미결제"] },
      { id: "non", title: "2. 비유동부채", type: "liability", keywords: ["대출","상속세","비유동"] }
    ];

    // [버그 수정] 자산과 부채는 카테고리명이 같아도 절대 합산되지 않도록 타입별로 완전히 분리해서 집계한다.
    var aT = 0, lT = 0;
    var aggByType = { asset: {}, liability: {} };
    var renderedByType = { asset: [], liability: [] };
    assets.forEach(function(it) {
      var bucket = aggByType[it.type];
      if (!bucket) return;
      bucket[it.category_name] = (bucket[it.category_name] || 0) + it.amount;
    });

    var html = '<div class="card" style="padding:0; overflow:hidden;"><table class="report-table">';

    // 키워드 순서에 따라 정렬하여 렌더링 (가나다순 제거, 유동성 우위 정렬)
    function renderGrp(groupTitle, groupType, keywords) {
      var agg = aggByType[groupType], rendered = renderedByType[groupType];
      var h = '<tr class="report-tr"><td colspan="2" class="report-section-title">' + groupTitle + '</td></tr>';
      var subTotal = 0;

      // 키워드 배열 순서(유동성 순서)대로 데이터를 찾아 출력 (agg가 이미 타입별로 분리되어 있어 교차 합산 불가)
      keywords.forEach(function(key) {
        Object.keys(agg).forEach(function(cat) {
          if (rendered.indexOf(cat) !== -1) return;
          if (cat.indexOf(key) !== -1) {
            h += '<tr class="report-tr"><td class="report-td indent">' + app.escapeHtml(cat) + '</td><td class="report-td text-right">' + agg[cat].toLocaleString() + '</td></tr>';
            subTotal += agg[cat]; rendered.push(cat);
          }
        });
      });

      h += '<tr class="report-tr sub-total-row"><td colspan="2" class="text-right" style="padding:12px 14px;">소계 ' + subTotal.toLocaleString() + '</td></tr>';
      if (groupType === 'asset') aT += subTotal; else lT += subTotal;
      return h;
    }

    html += '<tr class="report-tr" style="background:rgba(0,0,0,0.05);"><td colspan="2" class="report-td" style="font-weight:900;">자산 (Assets)</td></tr>';
    html += renderGrp(GROUPS[0].title, "asset", GROUPS[0].keywords);
    html += renderGrp(GROUPS[1].title, "asset", GROUPS[1].keywords);

    // [기타 자산] (정의되지 않은 특이 항목)
    var oASum = 0, oAH = "";
    Object.keys(aggByType.asset).forEach(function(c) {
      if (renderedByType.asset.indexOf(c) === -1) {
        oAH += '<tr class="report-tr"><td class="report-td indent opacity-50">' + app.escapeHtml(c) + ' (기타)</td><td class="report-td text-right opacity-50">' + aggByType.asset[c].toLocaleString() + '</td></tr>';
        oASum += aggByType.asset[c]; renderedByType.asset.push(c);
      }
    });
    if (oASum > 0) html += '<tr class="report-tr"><td colspan="2" class="report-section-title">3. 기타 자산</td></tr>' + oAH + '<tr class="report-tr sub-total-row"><td colspan="2" class="text-right" style="padding:12px 14px;">소계 ' + oASum.toLocaleString() + '</td></tr>'; aT += oASum;

    html += '<tr class="report-tr" style="background:rgba(0,0,0,0.05); border-top:2px solid var(--border);"><td colspan="2" class="report-td" style="font-weight:900;">부채 (Liabilities)</td></tr>';
    html += renderGrp(GROUPS[2].title, "liability", GROUPS[2].keywords);
    html += renderGrp(GROUPS[3].title, "liability", GROUPS[3].keywords);

    var oLSum = 0, oLH = "";
    Object.keys(aggByType.liability).forEach(function(c) {
      if (renderedByType.liability.indexOf(c) === -1) {
        oLH += '<tr class="report-tr"><td class="report-td indent opacity-50">' + app.escapeHtml(c) + ' (기타)</td><td class="report-td text-right opacity-50">' + aggByType.liability[c].toLocaleString() + '</td></tr>';
        oLSum += aggByType.liability[c]; renderedByType.liability.push(c);
      }
    });
    if (oLSum > 0) html += '<tr class="report-tr"><td colspan="2" class="report-section-title">3. 기타 부채</td></tr>' + oLH + '<tr class="report-tr sub-total-row"><td colspan="2" class="text-right" style="padding:12px 14px;">소계 ' + oLSum.toLocaleString() + '</td></tr>'; lT += oLSum;

    html += '</table></div><div class="card" style="background:var(--primary); color:white; display:flex; justify-content:space-between; font-weight:900; padding:18px;"><span>순자산 (Net Worth)</span><span>' + (aT - lT).toLocaleString() + '원</span></div>';
    container.innerHTML = html;
  },

  renderIS: function() {
    var s = document.getElementById('is-start').value, e = document.getElementById('is-end').value;
    if(!s || !e) return;
    var txs = this.db.data.transactions.filter(function(t){ return t.date >= s && t.date <= e; });
    var container = document.getElementById('is-result-area');
    if (!container) return;

    function buildTable(title, type, color) {
      // 대분류-소분류 컨벤션에 따라 대분류로 묶고, 대분류 안에서 소분류를 나열한다.
      var majorMap = {}; var sum = 0;
      txs.filter(function(t){ return t.type === type; }).forEach(function(t){
        var parts = app.splitCategory(t.category_name);
        if (!majorMap[parts.major]) majorMap[parts.major] = { total: 0, minors: {} };
        majorMap[parts.major].total += t.amount;
        var minorKey = parts.minor || t.category_name;
        majorMap[parts.major].minors[minorKey] = (majorMap[parts.major].minors[minorKey] || 0) + t.amount;
        sum += t.amount;
      });

      var h = '<div class="card" style="padding:0; overflow:hidden;"><table class="report-table"><thead><tr><th colspan="2" class="report-th" style="color:'+color+'; border-color:'+color+';">'+title+'</th></tr></thead><tbody>';
      // 금액이 큰 순서대로 정렬 (중요성 관리 원칙) - 대분류 우선, 대분류 안에서는 소분류끼리
      var sortedMajors = Object.keys(majorMap).sort(function(a, b) { return majorMap[b].total - majorMap[a].total; });
      sortedMajors.forEach(function(major) {
        var g = majorMap[major];
        var minorKeys = Object.keys(g.minors);
        if (minorKeys.length === 1 && minorKeys[0] === major) {
          // 소분류가 없는 단순 카테고리는 한 줄로 표시
          h += '<tr class="report-tr"><td class="report-td indent">' + app.escapeHtml(major) + '</td><td class="report-td text-right" style="color:'+color+';">' + g.total.toLocaleString() + '</td></tr>';
        } else {
          h += '<tr class="report-tr"><td class="report-td indent" style="font-weight:900;">' + app.escapeHtml(major) + '</td><td class="report-td text-right" style="font-weight:900; color:'+color+';">' + g.total.toLocaleString() + '</td></tr>';
          minorKeys.sort(function(a, b){ return g.minors[b] - g.minors[a]; }).forEach(function(mk) {
            h += '<tr class="report-tr"><td class="report-td indent" style="padding-left:36px; opacity:0.85;">└ ' + app.escapeHtml(mk) + '</td><td class="report-td text-right" style="opacity:0.85;">' + g.minors[mk].toLocaleString() + '</td></tr>';
          });
        }
      });
      h += '<tr class="report-tr sub-total-row"><td colspan="2" class="text-right" style="padding:12px 14px; color:'+color+';">소계 ' + sum.toLocaleString() + '</td></tr></tbody></table></div>';
      return { html: h, sum: sum };
    }

    var rI = buildTable("1. 수입 (Revenue)", "income", "var(--income)");
    var rE = buildTable("2. 비용 (Expense)", "expense", "var(--expense)");
    
    container.innerHTML = rI.html + rE.html + '<div class="card" style="background:var(--income); color:white; display:flex; justify-content:space-between; font-weight:900; padding:18px;"><span>당기순이익 (Net Income)</span><span>' + (rI.sum - rE.sum).toLocaleString() + '원</span></div>';
  }

};

// 절대적 초기화 실행
window.onload = function() { app.init(); };
setTimeout(function(){ if(!app.initialized) { console.log("Rescue init..."); app.init(); } }, 1000);
