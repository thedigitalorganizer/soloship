document.addEventListener('DOMContentLoaded', () => {

  // ── Sticky Header ──
  const header = document.querySelector('.site-header');
  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── Smooth Scroll Nav ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // ── Active Nav Highlighting ──
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const observerNav = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, {
    rootMargin: '-20% 0px -75% 0px'
  });

  sections.forEach(section => observerNav.observe(section));

  // ── Scroll Animations ──
  const animElements = document.querySelectorAll('.animate-on-scroll');

  const observerAnim = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observerAnim.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  animElements.forEach(el => observerAnim.observe(el));

  // ── Expand/Collapse Prompt Sections ──
  document.querySelectorAll('.expand-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const content = document.getElementById(targetId);
      const isOpen = content.classList.contains('is-open');

      if (isOpen) {
        content.classList.remove('is-open');
        btn.classList.remove('is-expanded');
        btn.querySelector('.toggle-text').textContent = 'View Full Prompt';
      } else {
        content.classList.add('is-open');
        btn.classList.add('is-expanded');
        btn.querySelector('.toggle-text').textContent = 'Hide Prompt';
      }
    });
  });

  // ── Mobile Menu Toggle ──
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu') || document.getElementById('mobile-menu-guide');
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

  // ── Copy to Clipboard ──
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const promptId = btn.getAttribute('data-prompt');
      const promptEl = document.getElementById(promptId);

      if (!promptEl) return;

      const text = promptEl.textContent.trim();

      try {
        await navigator.clipboard.writeText(text);

        btn.classList.add('is-copied');
        const textSpan = btn.querySelector('.btn-text');
        const originalText = textSpan.textContent;
        textSpan.textContent = 'Copied!';

        setTimeout(() => {
          btn.classList.remove('is-copied');
          textSpan.textContent = originalText;
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          btn.classList.add('is-copied');
          const textSpan = btn.querySelector('.btn-text');
          const originalText = textSpan.textContent;
          textSpan.textContent = 'Copied!';
          setTimeout(() => {
            btn.classList.remove('is-copied');
            textSpan.textContent = originalText;
          }, 2000);
        } catch (e) {
          console.error('Copy failed', e);
        }
        document.body.removeChild(textarea);
      }
    });
  });

});
