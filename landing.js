/* ============================================================
   ALPHARIA - Landing Page JavaScript
   Handles tabs, scroll animations, counters, navbar, mobile menu.
   ============================================================ */

(function () {
  'use strict';

  /* ── Navbar scroll effect ── */
  const navbar = document.getElementById('lp-navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 30);
    }, { passive: true });
  }

  /* ── Mobile hamburger ── */
  const hamburger = document.getElementById('lp-hamburger');
  const mobileNav = document.getElementById('lp-mobile-nav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open);
      // Animate bars
      const bars = hamburger.querySelectorAll('span');
      if (open) {
        bars[0].style.transform = 'translateY(7px) rotate(45deg)';
        bars[1].style.opacity  = '0';
        bars[2].style.transform = 'translateY(-7px) rotate(-45deg)';
      } else {
        bars.forEach(b => { b.style.transform = ''; b.style.opacity = ''; });
      }
    });

    // Close on mobile nav link click
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        const bars = hamburger.querySelectorAll('span');
        bars.forEach(b => { b.style.transform = ''; b.style.opacity = ''; });
      });
    });
  }

  /* ── Feature Tabs ── */
  const tabs = document.querySelectorAll('.lp-tab');
  const panels = document.querySelectorAll('.lp-tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById('panel-' + target);
      if (panel) panel.classList.add('active');
    });
  });

  /* ── Pricing toggle (monthly ↔ annual) ── */
  const toggle = document.getElementById('lp-billing-toggle');
  const prices = document.querySelectorAll('[data-monthly][data-annual]');
  const annualLabels = document.querySelectorAll('.lp-price-annual');
  let isAnnual = false;

  if (toggle) {
    toggle.addEventListener('click', () => {
      isAnnual = !isAnnual;
      toggle.classList.toggle('on', isAnnual);

      prices.forEach(el => {
        el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
      });

      annualLabels.forEach(el => {
        el.style.opacity = isAnnual ? '1' : '0.4';
      });
    });
  }

  /* ── Scroll Reveal using IntersectionObserver ── */
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: show everything immediately
    revealEls.forEach(el => el.classList.add('visible'));
  }

  /* ── Animated Counter ── */
  function animateCounter(el, target, duration = 1800, suffix = '') {
    const start = performance.now();
    const startVal = 0;

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (target - startVal) * eased);
      el.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  const counters = document.querySelectorAll('[data-counter]');
  if ('IntersectionObserver' in window && counters.length) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.counter, 10);
          const suffix = el.dataset.suffix || '';
          animateCounter(el, target, 1800, suffix);
          counterObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => counterObserver.observe(el));
  }

  /* ── Smooth scrolling for all anchor links ── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;

    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ── Active nav link highlight on scroll ── */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.lp-nav-links a, .lp-mobile-nav a');

  if (sections.length && navLinks.length) {
    const linkObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => {
            link.style.color = '';
          });
          const active = document.querySelector(`.lp-nav-links a[href="#${entry.target.id}"]`);
          if (active) active.style.color = 'white';
        }
      });
    }, { threshold: 0.4 });

    sections.forEach(sec => linkObserver.observe(sec));
  }

})();
