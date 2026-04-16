document.addEventListener('DOMContentLoaded', () => {

  // ── Sticky Header ──
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('is-scrolled', window.scrollY > 20);
  }, { passive: true });

  // ── Smooth Scroll ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
        // Close mobile TOC if open
        const sidebar = document.querySelector('.toc-sidebar');
        if (sidebar) sidebar.classList.remove('is-open');
      }
    });
  });

  // ── Sidebar TOC Active Highlighting ──
  const sections = document.querySelectorAll('section[id]');
  const tocLinks = document.querySelectorAll('.toc-link');

  if (tocLinks.length > 0) {
    const tocObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          tocLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    }, {
      rootMargin: '-20% 0px -75% 0px'
    });

    sections.forEach(section => tocObserver.observe(section));
  }

  // ── Mobile Menu Toggle ──
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu-guide');
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      mobileToggle.setAttribute('aria-expanded', isOpen);
    });
    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!mobileMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
        mobileMenu.classList.remove('is-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ── Tab Switching ──
  document.querySelectorAll('.tab-bar').forEach(bar => {
    const buttons = bar.querySelectorAll('.tab-btn');
    const container = bar.closest('.tab-container');
    const panels = container ? container.querySelectorAll('.tab-panel') : [];

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');

        buttons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        panels.forEach(p => {
          p.classList.toggle('active', p.getAttribute('data-panel') === target);
        });
      });
    });
  });

  // ── Exclusive Accordion ──
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const group = trigger.closest('.accordion-group');
      const isActive = item.classList.contains('is-active');

      // Close all siblings in the same group
      if (group) {
        group.querySelectorAll('.accordion-item').forEach(sibling => {
          sibling.classList.remove('is-active');
          sibling.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'false');
        });
      }

      // Toggle current
      if (!isActive) {
        item.classList.add('is-active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ── Expand/Collapse (Non-exclusive) ──
  document.querySelectorAll('.expand-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const content = document.getElementById(targetId);
      const isOpen = content.classList.contains('is-open');

      content.classList.toggle('is-open', !isOpen);
      btn.classList.toggle('is-expanded', !isOpen);
      btn.setAttribute('aria-expanded', !isOpen);

      const textEl = btn.querySelector('.toggle-text');
      if (textEl) {
        // Preserve the contextual part of the label (e.g., "View Plan Lifecycle rule" → "Hide Plan Lifecycle rule")
        const currentText = textEl.textContent;
        if (isOpen) {
          textEl.textContent = currentText.replace(/^Hide/, 'View');
        } else {
          textEl.textContent = currentText.replace(/^View/, 'Hide');
        }
      }
    });
  });

  // ── Copy to Clipboard ──
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-copy');
      const el = document.getElementById(targetId);
      if (!el) return;

      const text = el.textContent.trim();

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      btn.classList.add('is-copied');
      const textSpan = btn.querySelector('.btn-text');
      if (textSpan) {
        const original = textSpan.textContent;
        textSpan.textContent = 'Copied!';
        setTimeout(() => {
          btn.classList.remove('is-copied');
          textSpan.textContent = original;
        }, 2000);
      }
    });
  });

  // ── Scroll Animations ──
  const animElements = document.querySelectorAll('.animate-on-scroll');

  const animObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        animObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  animElements.forEach(el => animObserver.observe(el));

});
