/* ============================================================
   A-KIME v4 — Main JS
   Handles: navbar scroll, mobile menu, service tabs,
            portfolio filter, testimonial slider, contact form,
            company data injection from API
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('discoverBtn')?.addEventListener('click', () => {
    document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' });
  });

  // ── Authentication state management ────────────────────────────
  function isAuthenticated() {
    return !!sessionStorage.getItem('akime_token');
  }

  function getCurrentUser() {
    try {
      return JSON.parse(sessionStorage.getItem('akime_user'));
    } catch (e) {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem('akime_token');
    sessionStorage.removeItem('akime_user');
    updateNavForAuth();
    window.location.reload();
  }

  function updateNavForAuth() {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    if (isAuthenticated()) {
      // User is logged in: show admin link (if admin/editor) and logout button
      const user = getCurrentUser();
      const isStaff = user?.role === 'admin' || user?.role === 'editor';
      navActions.innerHTML = `
        <a href="tel:+237698012093" class="nav-phone">
          <i class="fas fa-phone-alt"></i>
        </a>
        ${isStaff ? `<a href="admin/dashboard.html" class="btn-signup"><i class="fas fa-chart-line"></i> ADMIN</a>` : ``}
        <button id="navLogoutBtn" class="btn-connexion" style="cursor: pointer;">
          <i class="fas fa-sign-out-alt"></i> DÉCONNECTER
        </button>
        <button class="menu-toggle" id="menuToggle" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      `;

      // Re-attach menu toggle listener
      const newMenuToggle = document.getElementById('menuToggle');
      const navLinksElInner = document.getElementById('navLinks');
      if (newMenuToggle && navLinksElInner) {
        newMenuToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          navLinksElInner.classList.toggle('mobile-open');
          newMenuToggle.classList.toggle('open');
        });
        navLinksElInner.querySelectorAll('a').forEach(a => {
          a.addEventListener('click', () => {
            navLinksElInner.classList.remove('mobile-open');
            newMenuToggle.classList.remove('open');
          });
        });
      }

      // Attach logout listener
      document.getElementById('navLogoutBtn')?.addEventListener('click', logout);
    }
  }

  // Update nav on page load
  updateNavForAuth();

  // ── Navbar scroll effect ──────────────────────────────────
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // ── Active nav link on scroll ────────────────────────────
  const sections = document.querySelectorAll('section[id], div[id]');
  const navLinks  = document.querySelectorAll('.nav-links a[href^="#"]');
  const observer  = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach(s => observer.observe(s));

  // ── Mobile menu ──────────────────────────────────────────
  const menuToggle = document.getElementById('menuToggle');
  const navLinksEl = document.getElementById('navLinks');
  if (menuToggle && navLinksEl) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navLinksEl.classList.toggle('mobile-open');
      menuToggle.classList.toggle('open');
    });
    navLinksEl.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinksEl.classList.remove('mobile-open');
        menuToggle.classList.remove('open');
      });
    });
    document.addEventListener('click', e => {
      if (!menuToggle.contains(e.target) && !navLinksEl.contains(e.target)) {
        navLinksEl.classList.remove('mobile-open');
        menuToggle.classList.remove('open');
      }
    });
  }

  // ── Services from API (replaces static tabs) ─────────────
  async function loadServicesPublic() {
    try {
      const res      = await fetch('/api/content/services');
      const json     = await res.json();
      const services = json.data;
      const tabsEl   = document.getElementById('servicesTabs');
      const panelEl  = document.getElementById('servicesPanel');
      if (!tabsEl || !panelEl) return;

      if (!Array.isArray(services) || services.length === 0) {
        tabsEl.innerHTML = '<div style="padding:20px;color:rgba(255,255,255,.4);font-size:.82rem;">Aucun service disponible.</div>';
        panelEl.innerHTML = '';
        return;
      }

      // Tabs
      tabsEl.innerHTML = services.map((s, i) => `
        <div class="service-tab ${i===0?'active':''}" data-idx="${i}">
          <div class="tab-icon"><i class="fas ${s.icon||'fa-cogs'}"></i></div>
          <span class="tab-name">${s.name||s.title}</span>
          <i class="fas fa-chevron-right tab-arrow"></i>
        </div>`).join('');

      // Panels
      panelEl.innerHTML = services.map((s, i) => {
        const imgHTML = s.imageUrl
          ? `<img src="${s.imageUrl}" alt="${s.name||s.title}" style="width:100%;height:100%;object-fit:cover;">`
          : `<div class="panel-image-placeholder"><i class="fas ${s.icon||'fa-cogs'}"></i><span>${s.name||s.title}</span></div>`;
        const tagsHTML = (s.subPages||[]).map(sp =>
          `<span class="panel-tag sp-tag" data-title="${sp.title}"
                 data-desc="${(sp.description||'').replace(/"/g,'&quot;')}">${sp.title}</span>`
        ).join('');
        const firstSp   = s.subPages && s.subPages.length > 0 ? s.subPages[0] : null;
        const initTitle = firstSp ? firstSp.title : (s.name||s.title);
        const initDesc  = firstSp ? (firstSp.description||s.description) : s.description;
        return `
          <div class="service-panel ${i===0?'active':''}" id="panel-api-${i}">
            <div class="panel-image" style="position:relative;">
              ${imgHTML}
              <div class="panel-tags">${tagsHTML}</div>
            </div>
            <div class="panel-body">
              <h3 class="panel-title sp-title">${initTitle}</h3>
              <div class="sp-subnav" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${(s.subPages||[]).map((sp,j)=>`
                  <button class="sp-nav-btn" data-title="${sp.title}"
                          data-desc="${(sp.description||'').replace(/"/g,'&quot;')}"
                          style="padding:5px 12px;border-radius:4px;font-size:.72rem;font-weight:700;
                          cursor:pointer;border:none;font-family:inherit;
                          background:${j===0?'var(--navy)':'var(--gray-light)'};
                          color:${j===0?'var(--white)':'var(--gray-dark)'};">
                    ${sp.title}
                  </button>`).join('')}
              </div>
              <p class="panel-desc sp-desc">${initDesc||s.description||''}</p>
              <a href="#contact" class="btn btn-navy">DEMANDER UN DEVIS <i class="fas fa-chevron-right"></i></a>
            </div>
          </div>`;
      }).join('');

      // Tab switching
      tabsEl.querySelectorAll('.service-tab').forEach((tab, i) => {
        tab.addEventListener('click', () => {
          tabsEl.querySelectorAll('.service-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          panelEl.querySelectorAll('.service-panel').forEach(p => p.classList.remove('active'));
          panelEl.querySelector(`#panel-api-${i}`)?.classList.add('active');
        });
      });

      // Sub-page nav btn click
      panelEl.addEventListener('click', e => {
        const btn = e.target.closest('.sp-nav-btn');
        if (!btn) return;
        const panel = btn.closest('.service-panel');
        panel.querySelectorAll('.sp-nav-btn').forEach(b => {
          b.style.background = 'var(--gray-light)'; b.style.color = 'var(--gray-dark)';
        });
        btn.style.background = 'var(--navy)'; btn.style.color = 'var(--white)';
        panel.querySelector('.sp-desc').textContent  = btn.dataset.desc  || '';
        panel.querySelector('.sp-title').textContent = btn.dataset.title || '';
        panel.querySelectorAll('.sp-tag').forEach(tag => {
          tag.style.opacity = tag.dataset.title === btn.dataset.title ? '1' : '0.5';
        });
      });

      // Tag click = same as nav btn
      panelEl.addEventListener('click', e => {
        const tag = e.target.closest('.sp-tag');
        if (!tag) return;
        const panel  = tag.closest('.service-panel');
        const navBtn = panel.querySelector(`.sp-nav-btn[data-title="${tag.dataset.title}"]`);
        if (navBtn) navBtn.click();
      });

    } catch (err) {
      console.error('loadServicesPublic error:', err);
    }
  }
  loadServicesPublic();



  // ── Portfolio filter ─────────────────────────────────────
  let filterBtns = document.querySelectorAll('.filter-btn');
  function initPortfolioFilters() {
    filterBtns = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        projectCards.forEach(card => {
          const match = filter === 'all' || card.dataset.category === filter;
          card.style.display = match ? '' : 'none';
        });
      });
    });
  }
  initPortfolioFilters();

  // ── Testimonial slider ───────────────────────────────────
  let testimonials = [];
  let dots = [];
  let current = 0;
  let sliderInterval = null;

  function initTestimonialSlider() {
    testimonials = document.querySelectorAll('.testimonial-card');
    dots = document.querySelectorAll('.slider-dot');
    
    // Clear existing interval if any
    if (sliderInterval) clearInterval(sliderInterval);
    
    if (testimonials.length > 0) {
      // Auto-advance every 5 seconds
      sliderInterval = setInterval(() => showTestimonial(current + 1), 5000);
    }
  }

  function showTestimonial(idx) {
    testimonials.forEach(t => t.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    if (testimonials.length > 0) {
      current = (idx + testimonials.length) % testimonials.length;
      if (testimonials[current]) testimonials[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');
    }
  }

  document.getElementById('sliderPrev')?.addEventListener('click', () => showTestimonial(current - 1));
  document.getElementById('sliderNext')?.addEventListener('click', () => showTestimonial(current + 1));

  // ── Testimonials from API ─────────────────────────────────
  async function loadTestimonials() {
    try {
      const res  = await fetch('/api/testimonials');
      const json = await res.json();
      const list = json.data;
      
      const slider = document.querySelector('.testimonials-slider');
      if (!slider) return;
      
      // Remove any existing testimonial cards
      const oldCards = slider.querySelectorAll('.testimonial-card');
      oldCards.forEach(c => c.remove());
      
      const controls = slider.querySelector('.slider-controls');
      
      if (Array.isArray(list) && list.length > 0) {
        list.forEach((t, i) => {
          const stars = Array(Math.round(t.rating || 5)).fill('<i class="fas fa-star"></i>').join('');
          const initials = (t.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
          const card = document.createElement('div');
          card.className = 'testimonial-card' + (i === 0 ? ' active' : '');
          card.id = `testimonial-${i}`;
          card.innerHTML = `
            <div class="stars">${stars}</div>
            <p class="testimonial-text">"${t.message}"</p>
            <div class="testimonial-author">
              <div class="author-avatar">${initials}</div>
              <div>
                <div class="author-name">${t.name}</div>
                <div class="author-role">${t.company || ''}</div>
              </div>
            </div>`;
          slider.insertBefore(card, controls);
        });

        // Rebuild dots
        const dotsWrap = slider.querySelector('.slider-dots');
        if (dotsWrap) {
          dotsWrap.innerHTML = list.map((_, i) =>
            `<button class="slider-dot ${i===0?'active':''}" data-idx="${i}"></button>`
          ).join('');
          dotsWrap.querySelectorAll('.slider-dot').forEach(dot =>
            dot.addEventListener('click', () => showTestimonial(+dot.dataset.idx))
          );
        }
      } else {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = 'var(--muted-foreground)';
        emptyMsg.style.padding = '40px';
        emptyMsg.textContent = 'Aucun témoignage pour le moment. Soyez le premier à en ajouter un !';
        slider.insertBefore(emptyMsg, controls);
      }
      
      // Re-initialize slider
      initTestimonialSlider();
      
    } catch (e) { 
      console.error('Error loading testimonials:', e);
    }
  }

  // ── Contact form ─────────────────────────────────────────
  const contactForm = document.getElementById('contactForm');
  const formSuccess = document.getElementById('formSuccess');
  if (contactForm) {
    contactForm.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = contactForm.querySelector('.btn-submit');
      btn.textContent = 'Envoi en cours…';
      btn.disabled = true;

      const data = Object.fromEntries(new FormData(contactForm));
      try {
        const res  = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.success) {
          contactForm.style.display = 'none';
          if (formSuccess) formSuccess.style.display = 'block';
        } else {
          throw new Error(json.message || 'Erreur');
        }
      } catch (err) {
        alert('Erreur lors de l\'envoi. Veuillez réessayer.');
        btn.textContent = 'ENVOYER MA DEMANDE DE DEVIS';
        btn.disabled = false;
      }
    });
  }

  // ── Company info from API ────────────────────────────────
  async function loadCompany() {
    try {
      const res  = await fetch('/api/content/company');
      const json = await res.json();
      const co   = json.data || json;
      if (!co) return;
      if (co.phone) {
        const el = document.getElementById('companyPhone');
        if (el) el.textContent = co.phone;
        const fp = document.getElementById('footerPhone');
        if (fp) fp.textContent = co.phone;
      }
      if (co.email) {
        const el = document.getElementById('companyEmail');
        if (el) el.textContent = co.email;
        const fe = document.getElementById('footerEmail');
        if (fe) fe.textContent = co.email;
      }
      if (co.address) {
        const el = document.getElementById('companyAddress');
        if (el) el.textContent = co.address;
        const fa = document.getElementById('footerAddress');
        if (fa) fa.textContent = co.address;
      }
    } catch (e) { /* fallback to static values */ }
  }

  // ── Projects from API ────────────────────────────────────
  async function loadProjects() {
    try {
      const res  = await fetch('/api/content/projects');
      const json = await res.json();
      const projects = json.data;
      
      const grid = document.getElementById('portfolioGrid');
      if (!grid) return;
      
      if (!Array.isArray(projects) || projects.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color: var(--muted-foreground); grid-column: 1/-1; padding: 40px;">Aucun projet pour le moment. Revenez plus tard !</p>';
        return;
      }

      // Map backend category to filter value
      const catMap = {
        civil: 'civil', genie: 'civil', 'genie-civil': 'civil',
        metal: 'metallique', metallique: 'metallique',
        finition: 'finition', renovation: 'renovation',
        'gros-oeuvre': 'gros-oeuvre', nettoyage: 'nettoyage',
        'pure-water': 'pure-water',
      };

      const catLabel = {
        civil: 'GÉNIE CIVIL', metallique: 'MÉTALLIQUE', finition: 'FINITION',
        renovation: 'RÉNOVATION', 'gros-oeuvre': 'GROS ŒUVRE',
        nettoyage: 'NETTOYAGE', 'pure-water': 'PURE WATER',
      };

      grid.innerHTML = projects.map((p, idx) => {
        const cat    = catMap[p.category] || p.category || 'divers';
        const label  = catLabel[cat] || cat.toUpperCase();
        const year   = p.date ? new Date(p.date).getFullYear() : '';
        const imgSrc = p.imageUrl
          ? `<img src="${p.imageUrl}" alt="${p.title}" loading="lazy">`
          : `<div class="project-card-img-placeholder"><i class="fas fa-building"></i></div>`;
        
        const hasGallery = p.gallery && p.gallery.length > 0;
        
        return `
          <div class="project-card" data-category="${cat}">
            <div class="project-card-img">
              ${imgSrc}
              ${year ? `<span class="project-year">${year}</span>` : ''}
              <span class="project-cat">${label}</span>
            </div>
            <div class="project-body">
              <div class="project-title">${p.title}</div>
              <div class="project-desc">${p.description || ''}</div>
              <div class="project-meta">
                ${p.location ? `<span><i class="fas fa-map-marker-alt"></i> ${p.location}</span>` : ''}
              </div>
              ${hasGallery || p.imageUrl ? `<button class="view-gallery-btn" data-idx="${idx}" style="margin-top:12px;width:100%;padding:10px;border:1px solid var(--gold);border-radius:4px;background:transparent;color:var(--gold);font-weight:700;cursor:pointer;transition:all 0.3s;">
                <i class="fas fa-images"></i> VOIR LA GALERIE
              </button>` : ''}
            </div>
          </div>`;
      }).join('');

      // Add gallery modal to DOM
      let galleryModal = document.getElementById('galleryModal');
      let lightboxModal = document.getElementById('lightboxModal');
      
      if (!galleryModal) {
        galleryModal = document.createElement('div');
        galleryModal.id = 'galleryModal';
        galleryModal.className = 'gallery-modal';
        galleryModal.innerHTML = `
          <div class="gallery-modal-content">
            <div class="gallery-modal-header">
              <h2 class="gallery-modal-title" id="galleryModalTitle">Galerie</h2>
              <button class="gallery-modal-close" id="galleryModalClose">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="gallery-grid" id="galleryGrid"></div>
          </div>
        `;
        document.body.appendChild(galleryModal);
        
        // Close modal listener
        document.getElementById('galleryModalClose').addEventListener('click', () => {
          galleryModal.classList.remove('active');
        });
        
        galleryModal.addEventListener('click', (e) => {
          if (e.target === galleryModal) {
            galleryModal.classList.remove('active');
          }
        });
      }
      
      if (!lightboxModal) {
        lightboxModal = document.createElement('div');
        lightboxModal.id = 'lightboxModal';
        lightboxModal.className = 'lightbox-modal';
        lightboxModal.innerHTML = `
          <span class="lightbox-close" id="lightboxClose">&times;</span>
          <img class="lightbox-image" id="lightboxImage">
        `;
        document.body.appendChild(lightboxModal);
        
        document.getElementById('lightboxClose').addEventListener('click', () => {
          lightboxModal.classList.remove('active');
        });
        
        lightboxModal.addEventListener('click', (e) => {
          if (e.target === lightboxModal) {
            lightboxModal.classList.remove('active');
          }
        });
      }

      // Re-bind filter buttons after DOM update
      initPortfolioFilters();

      // Bind gallery buttons
      const viewGalleryBtns = grid.querySelectorAll('.view-gallery-btn');
      viewGalleryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          const project = projects[idx];
          if (project) {
            const galleryGrid = document.getElementById('galleryGrid');
            document.getElementById('galleryModalTitle').textContent = project.title;
            
            // Include main image + gallery images
            const allImages = [project.imageUrl, ...(project.gallery || [])].filter(Boolean);
            
            galleryGrid.innerHTML = allImages.map(img => `
              <div class="gallery-item">
                <img src="${img}" alt="${project.title}" loading="lazy" class="gallery-lightbox-trigger">
              </div>
            `).join('');
            
            galleryModal.classList.add('active');
            
            // Add lightbox click listeners
            document.querySelectorAll('.gallery-lightbox-trigger').forEach(imgElement => {
              imgElement.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('lightboxImage').src = e.target.src;
                lightboxModal.classList.add('active');
              });
            });
          }
        });
      });
    } catch (e) { 
      console.error('Error loading projects:', e);
      const grid = document.getElementById('portfolioGrid');
      if (grid) grid.innerHTML = '<p style="text-align:center; color: var(--muted-foreground); grid-column: 1/-1; padding: 40px;">Erreur lors du chargement des projets.</p>';
    }
  }

  loadCompany();
  loadProjects();
  loadTestimonials();

  // ── Testimonial Submission Form ─────────────────────────────────
  const testimonialSubmitForm = document.getElementById('testimonialSubmitForm');
  const testimonialSubmitSuccess = document.getElementById('testimonialSubmitSuccess');
  const ratingStars = document.querySelectorAll('.rating-star');
  const ratingInput = document.getElementById('ratingInput');

  // Initialize star rating
  function initRating() {
    const currentRating = parseInt(ratingInput.value) || 5;
    ratingStars.forEach((star, index) => {
      if (index < currentRating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
  }

  initRating();

  ratingStars.forEach((star, index) => {
    star.addEventListener('click', () => {
      const rating = index + 1;
      ratingInput.value = rating;
      ratingStars.forEach((s, i) => {
        if (i < rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });

    star.addEventListener('mouseover', () => {
      const rating = index + 1;
      ratingStars.forEach((s, i) => {
        if (i < rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });

  document.querySelector('.rating-input').addEventListener('mouseleave', () => {
    initRating();
  });

  if (testimonialSubmitForm) {
    testimonialSubmitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = testimonialSubmitForm.querySelector('.btn-submit');
      btn.textContent = 'Envoi en cours…';
      btn.disabled = true;

      const data = Object.fromEntries(new FormData(testimonialSubmitForm));
      try {
        const res = await fetch('/api/testimonials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (json.success) {
          testimonialSubmitForm.style.display = 'none';
          testimonialSubmitSuccess.style.display = 'block';
        } else {
          throw new Error(json.message || 'Erreur');
        }
      } catch (err) {
        alert('Erreur lors de l\'envoi. Veuillez réessayer.');
        btn.textContent = 'ENVOYER VOTRE TÉMOIGNAGE';
        btn.disabled = false;
      }
    });
  }
});
