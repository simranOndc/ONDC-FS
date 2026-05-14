// flow.js

var flows;

// Human-readable inline comments for known JSON field paths
const FIELD_COMMENTS = {
  'context': 'Routing & identity metadata shared across all messages',
  'context.domain': 'ONDC domain — FIS12 = Financial Services v2',
  'context.location': 'Geographic scope of this request',
  'context.location.country.code': 'ISO 3166-1 alpha-3 country code',
  'context.location.city.code': '"*" = applicable to all cities',
  'context.transaction_id': 'Ties all messages in one end-to-end transaction',
  'context.message_id': 'Unique ID for this specific API call',
  'context.action': 'Beckn API action being invoked',
  'context.timestamp': 'When this request was sent (UTC, ISO 8601)',
  'context.version': 'Beckn protocol specification version',
  'context.ttl': 'Request validity window (ISO 8601 duration — PT10M = 10 min)',
  'context.bap_id': 'Buyer App Platform ID (registered in ONDC registry)',
  'context.bap_uri': 'BAP webhook — where BPP should send responses',
  'context.bpp_id': 'Seller / Lender App Platform ID',
  'context.bpp_uri': 'BPP callback URL for BAP to call',
  'message': 'Core business payload',
  'message.intent': 'Buyer search criteria and preferences',
  'message.intent.category': 'Product category filter',
  'message.intent.category.descriptor.code': 'Loan / product type being searched',
  'message.intent.payment.collected_by': 'BPP = lender collects · BAP = buyer platform collects',
  'message.order': 'The loan / financial product order',
  'message.order.provider': 'The lender / financial service provider',
  'message.order.provider.id': 'Lender identifier in ONDC registry',
  'message.order.items': 'Loan products and EMI plans in this order',
  'message.order.fulfillments': 'Disbursement & repayment schedule details',
  'message.order.payments': 'Payment instructions and terms',
  'message.order.quote': 'Full itemised cost breakdown for the loan',
  'message.order.quote.price': 'Total loan disbursement amount',
  'message.order.quote.breakup': 'Individual fee and charge line items',
  'message.order.id': 'Lender-assigned loan / order reference ID',
  'message.order.status': 'Current lifecycle state of the loan order',
  'message.order.cancellation_terms': 'Foreclosure and cancellation policy terms',
  'message.order.docs': 'KYC documents required from borrower',
  'message.order.tags': 'Additional structured metadata for the order',
  'message.order.provider.descriptor': 'Lender branding — name, logo, description',
  'message.order.provider.locations': 'Physical / operational locations of the lender',
  'message.order.items[0]': 'First loan product / plan offered',
  'message.order.billing': 'Borrower billing and KYC details',
  'message.order.created_at': 'When this order was first created',
  'message.order.updated_at': 'When this order was last updated',
  'message.ack': 'Synchronous acknowledgement of receipt',
  'message.ack.status': 'ACK = accepted for processing · NACK = rejected',
  'message.error': 'Error details if NACK',
};

// Well-known descriptor code values → plain-English explanations
const CODE_LABELS = {
  'PERSONAL_LOAN': 'Personal unsecured loan product',
  'GOLD_LOAN': 'Gold-collateral loan product',
  'CREDIT_CARD': 'Credit Card product',
  'BUYER_FINDER_FEES': 'Platform fee charged by BAP to the buyer',
  'BUYER_FINDER_FEES_TYPE': 'Fee type: percent-annualised or flat amount',
  'CONSENT_INFO': 'Account Aggregator (AA) consent details',
  'LOAN_INFO': 'Core loan terms — amount, tenure, rate',
  'LOAN_FORECLOSURE': 'Early full repayment of outstanding principal',
  'PRE_PART_PAYMENT': 'Partial prepayment to reduce principal',
  'MISSED_EMI_PAYMENT': 'Recovery payment for a missed EMI',
  'DISBURSEMENT': 'Loan disbursement event details',
  'REPAYMENT': 'Scheduled repayment / EMI event',
  'INSTALLMENT': 'Single EMI installment details',
  'CREDIT_LIMIT': 'Maximum sanctioned credit amount',
  'INTEREST_RATE': 'Annual interest rate (APR)',
  'PROCESSING_FEE': 'One-time loan processing charge',
  'INSURANCE_CHARGES': 'Loan protection insurance premium',
  'NET_DISBURSED_AMOUNT': 'Amount credited after deducting upfront fees',
  'OTHER_UPFRONT_CHARGES': 'Miscellaneous charges deducted at disbursement',
  'EMI': 'Equated Monthly Installment amount',
  'PRINCIPAL': 'Outstanding principal component of EMI',
  'INTEREST': 'Interest component of EMI',
  'GST': 'Goods & Services Tax',
  'TCS': 'Tax Collected at Source',
  'FORECLOSURE_FEE': 'Penalty levied for early full repayment',
  'PREPAYMENT_FEE': 'Penalty for partial early repayment',
  'OVERDUE_INTEREST': 'Penal interest on overdue amount',
  'DELAYED_INTEREST': 'Additional interest charged for payment delays',
  'BOUNCED_CHARGE': 'Fee for bounced ECS / NACH debit',
  'PENNY_DROP': 'Small test credit to verify beneficiary bank account',
  'MANDATE_REGISTRATION': 'e-NACH / auto-debit mandate setup',
  'ACK': 'Request accepted — will process asynchronously',
  'NACK': 'Request rejected — see error details',
  'ACTIVE': 'Loan is currently active and in repayment',
  'COMPLETE': 'Loan fully repaid and closed',
  'CANCELLED': 'Order / loan application cancelled',
  'SOFT_SANCTION': 'Conditional approval — final sanction pending verification',
  'SANCTIONED': 'Loan fully approved',
};

function getFieldComment(path, value) {
  if (FIELD_COMMENTS[path]) return FIELD_COMMENTS[path];
  if (typeof value === 'string' && CODE_LABELS[value]) return CODE_LABELS[value];
  return null;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderAnnotatedJSON(obj, path, indent) {
  indent = indent || 0;
  const pad  = '  '.repeat(indent);
  const pad1 = '  '.repeat(indent + 1);

  if (obj === null)
    return '<span class="rj-null">null</span>';
  if (typeof obj === 'boolean')
    return `<span class="rj-bool">${obj}</span>`;
  if (typeof obj === 'number')
    return `<span class="rj-num">${obj}</span>`;
  if (typeof obj === 'string') {
    const cmt = getFieldComment(path, obj);
    const cmtHtml = cmt ? `  <span class="rj-comment">// ${escHtml(cmt)}</span>` : '';
    return `<span class="rj-str">&quot;${escHtml(obj)}&quot;</span>${cmtHtml}`;
  }

  if (Array.isArray(obj)) {
    if (!obj.length) return '<span class="rj-punct">[]</span>';
    const items = obj.map((v, i) =>
      `${pad1}${renderAnnotatedJSON(v, `${path}[${i}]`, indent + 1)}`
    );
    return `<span class="rj-punct">[</span>\n${items.join('<span class="rj-punct">,</span>\n')}\n${pad}<span class="rj-punct">]</span>`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (!keys.length) return '<span class="rj-punct">{}</span>';
    const objCmt = getFieldComment(path, null);
    const objCmtHtml = objCmt ? `  <span class="rj-comment">// ${escHtml(objCmt)}</span>` : '';
    const lines = keys.map((k, i) => {
      const childPath = path ? `${path}.${k}` : k;
      const comma = i < keys.length - 1 ? '<span class="rj-punct">,</span>' : '';
      return `${pad1}<span class="rj-key" data-path="${escHtml(childPath)}" onclick="showFieldInfo('${escHtml(childPath)}')">&quot;${escHtml(k)}&quot;</span><span class="rj-punct">: </span>${renderAnnotatedJSON(obj[k], childPath, indent + 1)}${comma}`;
    });
    return `<span class="rj-punct">{</span>${objCmtHtml}\n${lines.join('\n')}\n${pad}<span class="rj-punct">}</span>`;
  }
  return escHtml(String(obj));
}

function getMethodMeta(api) {
  if (!api) return { label: 'STEP', cls: 'badge-step' };
  const a = api.toLowerCase();
  if (a.startsWith('on_')) return { label: api.toUpperCase(), cls: 'badge-response', dir: 'BPP → BAP' };
  if (a === 'form')          return { label: 'FORM',          cls: 'badge-form',     dir: 'User Input' };
  return { label: api.toUpperCase(), cls: 'badge-request', dir: 'BAP → BPP' };
}

function highlightSearch(container, query) {
  // Remove old highlights first
  container.querySelectorAll('mark.rj-highlight').forEach(m => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  container.normalize();
  if (!query || query.length < 2) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  nodes.forEach(node => {
    const val = node.nodeValue;
    if (!re.test(val)) return;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(val)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(val.slice(last, m.index)));
      const mark = document.createElement('mark');
      mark.className = 'rj-highlight';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = re.lastIndex;
    }
    if (last < val.length) frag.appendChild(document.createTextNode(val.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
}

async function loadSteps(steps) {
  const stepPane    = document.querySelector('.step-pane');
  const contentPane = document.querySelector('.content-pane');
  stepPane.innerHTML    = '';
  contentPane.innerHTML = '';

  for (const [index, step] of steps?.entries()) {
    const { details } = step || [];
    const meta = getMethodMeta(step.api);

    // --- Sidebar step item ---
    const link = document.createElement('a');
    link.href = '#' + step.summary;
    link.classList.add('list-group-item', 'list-group-item-action', 'step-item');
    link.innerHTML = `
      <div class="step-item-inner">
        <span class="step-num">${index + 1}</span>
        <div class="step-item-body">
          <span class="method-badge ${meta.cls}">${meta.label}</span>
          ${step.stepName ? `<span class="step-name">${step.stepName}</span>` : ''}
          ${meta.dir ? `<span class="step-dir">${meta.dir}</span>` : ''}
        </div>
      </div>`;

    // --- Content panel ---
    const content = document.createElement('div');
    content.id = step.summary;
    content.classList.add('step-content', 'p-4');

    // Title row
    const titleRow = document.createElement('div');
    titleRow.className = 'step-title-row';
    titleRow.innerHTML = `
      <span class="method-badge ${meta.cls} badge-lg">${meta.label}</span>
      <h4 class="step-heading">${escHtml(step.summary)}</h4>
      ${meta.dir ? `<span class="step-dir-pill">${meta.dir}</span>` : ''}`;
    content.appendChild(titleRow);

    // Details / mermaid
    if (details?.length) {
      const detailsWrap = document.createElement('div');
      detailsWrap.className = 'step-details-wrap';
      for (const [innerIndex, detail] of details.entries()) {
        const { description, mermaid: mermaidGraph } = detail;
        const pane = document.createElement('div');
        pane.className = 'detail-pane';
        let svgHtml = '';
        if (mermaidGraph) {
          try {
            const clean = mermaidGraph.replace(/`/g, '');
            const result = await mermaid.render(`summary${index}_${innerIndex}`, clean);
            svgHtml = result.svg || '';
          } catch (e) {}
        }
        pane.innerHTML = `
          <p class="detail-description">${innerIndex + 1}) ${escHtml(description)}</p>
          ${svgHtml ? `<div class="mermaid-svg-wrap">${svgHtml}</div>` : ''}`;
        detailsWrap.appendChild(pane);
      }
      content.appendChild(detailsWrap);
    }

    // Payload section
    const payloadSection = document.createElement('div');
    payloadSection.className = 'payload-section';

    if (step.api === 'form') {
      payloadSection.innerHTML = `
        <pre class="yaml-content"><xmp>${step.example?.value || ''}</xmp></pre>
        <div class="flow-forms">${step.example?.value || ''}</div>`;
    } else if (step.example?.value) {
      // Search bar
      const searchBar = document.createElement('div');
      searchBar.className = 'payload-search-wrap';
      searchBar.innerHTML = `
        <input class="payload-search-input" type="text" placeholder="🔍  Search fields or values…" autocomplete="off" />
        <span class="payload-search-hint">Type to highlight matches</span>`;
      payloadSection.appendChild(searchBar);

      // Copy button + code block
      const codeSection = document.createElement('div');
      codeSection.className = 'code-section';

      const codeHeader = document.createElement('div');
      codeHeader.className = 'code-block-header';
      codeHeader.innerHTML = `<span class="cbh-action">${(step.api || 'PAYLOAD').toUpperCase()}</span><span class="cbh-dir">${meta.dir || 'payload'}</span>`;
      codeSection.appendChild(codeHeader);

      const pre = document.createElement('pre');
      pre.className = 'annotated-json';
      pre.innerHTML = renderAnnotatedJSON(step.example.value, '', 0);
      codeSection.appendChild(pre);

      const copyBtn = document.createElement('div');
      copyBtn.className = 'copy-code-button';
      copyBtn.style.backgroundImage = 'url("icons/icon-copy.png")';
      copyBtn.addEventListener('click', e => {
        e.preventDefault();
        navigator.clipboard?.writeText(JSON.stringify(step.example.value, null, 2))
          .catch(() => {
            const ta = document.createElement('textarea');
            ta.value = JSON.stringify(step.example.value, null, 2);
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          });
        copyBtn.style.backgroundImage = 'url("icons/icon-tick.png")';
        setTimeout(() => { copyBtn.style.backgroundImage = 'url("icons/icon-copy.png")'; }, 2000);
      });
      codeSection.appendChild(copyBtn);
      payloadSection.appendChild(codeSection);

      // Wire up search
      searchBar.querySelector('.payload-search-input').addEventListener('input', function () {
        highlightSearch(pre, this.value.trim());
        const firstMark = pre.querySelector('mark.rj-highlight');
        if (firstMark) firstMark.scrollIntoView({ block: 'nearest' });
      });
    }

    content.appendChild(payloadSection);

    // Step click handler
    link.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelectorAll('.step-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.step-content').forEach(c => c.classList.remove('active'));
      link.classList.add('active');
      content.classList.add('active');
      const url = new URL(window.location);
      url.searchParams.set('callId', link.getAttribute('href'));
      window.history.pushState({}, '', url);
    });

    stepPane.appendChild(link);
    contentPane.appendChild(content);
  }

  // Restore from URL param
  const callId = new URLSearchParams(window.location.search).get('callId');
  if (callId) {
    const anchor = document.querySelector(`a[href="${callId}"]`);
    if (anchor) anchor.click();
  } else {
    // Auto-select first step
    const first = stepPane.querySelector('.step-item');
    if (first) first.click();
  }
}

function updateFlow() {
  const flowDropdown = document.getElementById('flow-dropdown');
  const selectedValue = flowDropdown.value;
  const url = new URL(window.location);
  url.searchParams.set('flowId', selectedValue);
  window.history.pushState({}, '', url);
  loadFlow(selectedValue);
}

async function loadFlow(flowName) {
  const flowSummary     = document.getElementById('flow-summary');
  const flowDescription = document.getElementById('flow-description');
  const versionDropdown = document.getElementById('version-dropdown');
  const content         = document.getElementById('content');
  const home            = document.getElementById('home');
  const loader          = document.getElementById('loader');

  versionDropdown.style.display = 'block';
  content.style.display         = 'block';
  home.style.display            = 'none';
  loader.style.display          = 'none';

  flowSummary.innerHTML    = '';
  flowDescription.innerHTML = '';

  const selectedFlow = flows.find(f => f.summary === flowName);
  if (!selectedFlow) return;

  flowSummary.textContent = selectedFlow.summary;

  if (selectedFlow.details?.length) {
    const wrap = document.createElement('div');
    for (const [i, detail] of selectedFlow.details.entries()) {
      const pane = document.createElement('div');
      const { description, mermaid: mermaidGraph } = detail;
      let svgHtml = '';
      if (mermaidGraph) {
        try {
          const clean = mermaidGraph.replace(/`/g, '');
          const result = await mermaid.render(`main-summary${i}`, clean);
          svgHtml = result.svg || '';
        } catch (e) {}
      }
      pane.innerHTML = `<p>${i + 1}) ${escHtml(description)}</p>${svgHtml ? `<div class="mermaid-svg-wrap">${svgHtml}</div>` : ''}`;
      wrap.appendChild(pane);
    }
    flowDescription.appendChild(wrap);
  }

  loadSteps(selectedFlow.steps);
}

function loadFlows(data) {
  flows = data;
  const flowDropdown = document.getElementById('flow-dropdown');
  flowDropdown.innerHTML = '';

  const urlParams = new URLSearchParams(window.location.search);
  const flowID    = urlParams.get('flowId');

  flows.forEach((flow, index) => {
    if (index === 0 && !flowID) {
      const url = new URL(window.location);
      url.searchParams.set('flowId', flow.summary);
      window.history.pushState({}, '', url);
    }
    const option = document.createElement('option');
    option.text = flow.summary;
    flowDropdown.add(option);
  });

  if (flowID) {
    flowDropdown.value = flowID;
    loadFlow(flowID);
  } else {
    loadFlow(flows[0].summary);
  }
}

function showFieldInfo(path) {
  const panel = document.getElementById('field-info-content');
  if (!panel) return;
  const def = FIELD_COMMENTS[path];
  const parts = path.split('.');
  const key = parts[parts.length - 1].replace(/\[\d+\].*/, '');
  panel.innerHTML = `
    <div class="field-info-path">${path}</div>
    ${def
      ? `<div class="field-info-desc">${def}</div>`
      : `<div class="field-info-no-def">No definition on record for this path.<br>Check the Attributes tab in Reference for schema details.</div>`
    }`;
}

function mermaidToggle() {
  const arrowIcon       = document.getElementById('mermiad-collapse-icon');
  const mermaidContainer = document.getElementById('flow-description');
  const isHidden = window.getComputedStyle(mermaidContainer).display === 'none';
  arrowIcon.style.transform        = isHidden ? 'rotate(90deg)' : 'rotate(270deg)';
  mermaidContainer.style.display   = isHidden ? 'block' : 'none';
}
