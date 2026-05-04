import { Pane } from 'https://cdn.skypack.dev/tweakpane@4.0.4';
import { gsap } from 'https://cdn.skypack.dev/gsap@3.13.0';
import Draggable from 'https://cdn.skypack.dev/gsap@3.13.0/Draggable';
gsap.registerPlugin(Draggable);

const config = {
  theme: 'system',
  radius: 2,
  size: 4,
  panels: 3 };


const ctrl = new Pane({
  title: 'config' });


ctrl.addBinding(config, 'theme', {
  label: 'theme',
  options: {
    system: 'system',
    light: 'light',
    dark: 'dark' } });



ctrl.addBinding(config, 'radius', {
  min: 0,
  max: 10,
  step: 1 });


ctrl.addBinding(config, 'size', {
  min: 2,
  max: 10,
  step: 1 });


const update = () => {
  document.documentElement.dataset.theme = config.theme;
  document.documentElement.style.setProperty('--rad', config.radius);
  document.documentElement.style.setProperty('--size', config.size);
};

const sync = event => {
  if (
  !document.startViewTransition ||
  event.target.controller.view.labelElement.innerText !== 'theme')

  return update();
  document.startViewTransition(() => update());
};

ctrl.on('change', sync);

// tell styles if config is raw
const isRaw = new URLSearchParams(window.location.search).get('raw') === 'true';
if (isRaw) document.documentElement.dataset.raw = 'true';

// Draggable controls
const tweakClass = 'div.tp-dfwv';
const d = Draggable.create(tweakClass, {
  type: 'x,y',
  allowEventDefault: true,
  trigger: tweakClass + ' button.tp-rotv_b' });

document.querySelector(tweakClass).addEventListener('dblclick', () => {
  gsap.to(tweakClass, {
    x: `+=${d[0].x * -1}`,
    y: `+=${d[0].y * -1}`,
    onComplete: () => {
      gsap.set(tweakClass, { clearProps: 'all' });
    } });

});
update();

// SlideshowStack Web Component
// A pure behavior enhancement that adds ARIA patterns and keyboard navigation
// to existing tab markup. Tabs can be nested at any level within the component.
// Note: This component focuses only on core tab functionality. Additional features
// like drag interaction are available as separate extensions.
class SlideshowStack extends HTMLElement {
  constructor() {
    super();
    this._activeTabIndex = 0;
    this._tabs = [];
    this._panels = [];
    this._abortController = null;
  }

  // Public properties
  get activeTab() {
    return this._activeTabIndex;
  }

  set activeTab(index) {
    if (index >= 0 && index < this._tabs.length) {
      this.activateTab(index);
    }
  }

  get totalTabs() {
    return this._tabs.length;
  }

  // Lifecycle methods
  connectedCallback() {
    this._initialize();
  }

  disconnectedCallback() {
    this._cleanup();
  }

  // Public methods
  activateTab(index) {
    if (index < 0 || index >= this._tabs.length) {
      console.warn(`Invalid tab index: ${index}`);
      return;
    }

    const previousIndex = this._activeTabIndex;

    // Don't do anything if it's already the active tab
    if (index === previousIndex) {
      return;
    }

    // Update previous tab and panel
    const previousTab = this._tabs[previousIndex];
    const previousPanel = this._panels[previousIndex];

    if (previousTab && previousPanel) {
      previousTab.setAttribute('aria-selected', 'false');
      previousTab.setAttribute('tabindex', '-1');
      previousPanel.setAttribute('inert', '');
    }

    // Update new tab and panel
    const newTab = this._tabs[index];
    const newPanel = this._panels[index];

    if (newTab && newPanel) {
      newTab.setAttribute('aria-selected', 'true');
      newTab.setAttribute('tabindex', '0');
      newPanel.removeAttribute('inert');

      // Update internal state
      this._activeTabIndex = index;

      // Dispatch custom event
      this.dispatchEvent(new CustomEvent('tabchange', {
        detail: {
          activeTab: index,
          previousTab: previousIndex,
          totalTabs: this._tabs.length },

        bubbles: true }));

    }
  }

  focusTab(index) {
    if (index >= 0 && index < this._tabs.length) {
      this._tabs[index].focus();
    }
  }

  refresh() {
    // Clean up existing event listeners
    this._cleanup();

    // Re-initialize the component
    this._initialize();
  }

  // Private methods
  _initialize() {
    // Find all tabs and panels within the component
    // Note: tabs can be nested at any level within the tablist
    this._tabs = Array.from(this.querySelectorAll('[role="tab"]'));
    this._panels = Array.from(this.querySelectorAll('[role="tabpanel"]'));

    // Validate structure
    if (this._tabs.length === 0 || this._panels.length === 0) {
      console.warn('SlideshowStack: No tabs or panels found');
      return;
    }

    if (this._tabs.length !== this._panels.length) {
      console.warn('SlideshowStack: Mismatch between number of tabs and panels');
    }

    // Find initial active tab
    const selectedTab = this._tabs.findIndex((tab) =>
    tab.getAttribute('aria-selected') === 'true');

    this._activeTabIndex = selectedTab >= 0 ? selectedTab : 0;

    // Ensure initial state is correct
    this._ensureInitialState();

    // Add event listeners
    this._attachEventListeners();
  }

  _ensureInitialState() {
    // Set all tabs to inactive state first
    this._tabs.forEach((tab, index) => {
      const isActive = index === this._activeTabIndex;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Set all panels state
    this._panels.forEach((panel, index) => {
      const isActive = index === this._activeTabIndex;
      if (isActive) {
        panel.removeAttribute('inert');
      } else {
        panel.setAttribute('inert', '');
      }
      // Ensure all panels have tabindex for content access
      if (!panel.hasAttribute('tabindex')) {
        panel.setAttribute('tabindex', '0');
      }
    });
  }

  _attachEventListeners() {
    // Create new AbortController for this set of listeners
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    // Get the tablist element
    const tablist = this.querySelector('[role="tablist"]');

    if (tablist) {
      // Use event delegation for keyboard events
      tablist.addEventListener('keydown', event => this._handleKeydown(event), { signal });

      // Add focus and click handlers to tabs for automatic activation
      this._tabs.forEach((tab, index) => {
        // Click handler
        tab.addEventListener('click', () => this.activateTab(index), { signal });

        // Focus handler for automatic activation
        tab.addEventListener('focus', () => this.activateTab(index), { signal });
      });
    }
  }

  _handleKeydown(event) {
    const target = event.target;

    // Only handle if target is a tab
    if (target.getAttribute('role') !== 'tab') {
      return;
    }

    const currentIndex = this._tabs.indexOf(target);
    if (currentIndex === -1) {
      return;
    }

    let handled = false;
    let newIndex = currentIndex;

    switch (event.key) {
      case 'ArrowLeft':
        // Move to previous tab, wrap to last
        newIndex = currentIndex - 1;
        if (newIndex < 0) {
          newIndex = this._tabs.length - 1;
        }
        this.focusTab(newIndex);
        handled = true;
        break;

      case 'ArrowRight':
        // Move to next tab, wrap to first
        newIndex = currentIndex + 1;
        if (newIndex >= this._tabs.length) {
          newIndex = 0;
        }
        this.focusTab(newIndex);
        handled = true;
        break;

      case 'Home':
        // Move to first tab
        this.focusTab(0);
        handled = true;
        break;

      case 'End':
        // Move to last tab
        this.focusTab(this._tabs.length - 1);
        handled = true;
        break;}


    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  _cleanup() {
    // Abort all event listeners at once
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    // Clear references
    this._tabs = [];
    this._panels = [];
  }}


// Register the custom element
customElements.define('slideshow-stack', SlideshowStack);

// Helper function to generate grid sizes
function generateGridSizes(totalTabs, activeIndex) {
  return Array(totalTabs).fill(1).map((_, index) => index === activeIndex ? 20 : 1);
}

// Helper function to format grid sizes for CSS
function formatGridSizes(sizes) {
  return sizes.map(s => `${s}fr`).join(' ');
}

// Demo: Listen for tab changes and log them
// This demo shows how to use the slideshow with the optional drag interaction
// To use without drag, simply omit the setupDragInteraction() call
const slideshow = document.querySelector('slideshow-stack');
let dragCleanup = null;

if (slideshow) {
  const initializeSlideshow = () => {
    const container = slideshow.firstElementChild;

    // Set initial grid configuration
    const updateGridConfig = activeIndex => {
      const sizes = generateGridSizes(slideshow.totalTabs, activeIndex);
      container.style.setProperty('--active-tab', formatGridSizes(sizes));
    };

    // Remove old listener if exists
    if (slideshow._updateHandler) {
      slideshow.removeEventListener('tabchange', slideshow._updateHandler);
    }

    // Create new handler
    slideshow._updateHandler = event => {
      updateGridConfig(event.detail.activeTab);
    };

    // Listen for tab change events
    slideshow.addEventListener('tabchange', slideshow._updateHandler);

    // Initialize
    container.style.setProperty('--total-tabs', slideshow.totalTabs);
    updateGridConfig(slideshow.activeTab || 0);

    // Clean up old drag interaction
    if (dragCleanup) {
      dragCleanup();
    }

    // Add drag interaction to the slideshow stack (optional extension)
    dragCleanup = setupDragInteraction(slideshow);
  };

  // Initial setup
  initializeSlideshow();

  // Store for re-initialization
  slideshow._initializeSlideshow = initializeSlideshow;
}


// Drag interaction extension for the slideshow stack
// This is an optional enhancement that can be applied to any slideshow-stack instance
// It's not part of the core web component to keep the component flexible
function setupDragInteraction(slideshow, options = {}) {
  const container = slideshow.firstElementChild;
  const { dragThreshold = 5, completionThreshold = 0.5, maxDragRatio = 0.8 } = options;

  let dragState = null;
  let abortController = new AbortController();
  let preventNextClick = false;

  const setGridSizes = sizes => {
    container.style.setProperty('--active-tab', formatGridSizes(sizes));
  };

  const handlePointerDown = event => {
    const tabs = [...slideshow.querySelectorAll('[role="tab"]')];
    const activeIndex = slideshow.activeTab;
    const panels = slideshow.querySelector('.slideshow-stack__panels');
    const isHorizontal = window.getComputedStyle(panels).gridTemplateColumns.split(' ').length > 1;
    const containerRect = container.getBoundingClientRect();
    const buttonWidth = parseFloat(window.getComputedStyle(container).getPropertyValue('--button-width')) || 64;

    let tabIndex = -1;
    let targetTabIndex = -1;

    // Check if clicking on a tab button
    const tab = event.target.closest('[role="tab"]');
    if (tab) {
      tabIndex = tabs.indexOf(tab);
      if (tabIndex === activeIndex) return; // Can't drag active tab

      // For tabs before active, they expand themselves
      // For tabs after active, they act as handles to expand the next tab
      if (tabIndex > activeIndex) {
        targetTabIndex = tabIndex + 1;
        // Don't allow if there's no next tab to expand
        if (targetTabIndex >= tabs.length) return;
      } else {
        targetTabIndex = tabIndex;
      }
    } else {
      // Check if clicking in the virtual button area of the active panel
      if (isHorizontal) {
        const panels = slideshow.querySelectorAll('[role="tabpanel"]');
        const activePanel = panels[activeIndex];
        if (!activePanel) return;

        const activePanelRect = activePanel.getBoundingClientRect();
        const clickX = event.clientX;

        // Check if click is in the right edge "button area" of active panel
        if (clickX >= activePanelRect.right - buttonWidth && clickX <= activePanelRect.right) {
          // This acts as if we're dragging the next tab after active
          tabIndex = activeIndex + 1;
          targetTabIndex = activeIndex + 1;

          // Don't allow if there's no next tab
          if (tabIndex >= tabs.length) return;
        } else {
          return; // Not in a draggable area
        }
      } else {
        // Handle vertical orientation (similar logic for bottom edge)
        const panels = slideshow.querySelectorAll('[role="tabpanel"]');
        const activePanel = panels[activeIndex];
        if (!activePanel) return;

        const activePanelRect = activePanel.getBoundingClientRect();
        const clickY = event.clientY;

        // Check if click is in the bottom edge "button area" of active panel
        if (clickY >= activePanelRect.bottom - buttonWidth && clickY <= activePanelRect.bottom) {
          tabIndex = activeIndex + 1;
          targetTabIndex = activeIndex + 1;

          if (tabIndex >= tabs.length) return;
        } else {
          return;
        }
      }
    }

    dragState = {
      tabIndex,
      targetTabIndex,
      activeIndex,
      isHorizontal,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      currentProgress: 0,
      originalSizes: container.style.getPropertyValue('--active-tab').split(' ').map(s => parseFloat(s) || 1),
      maxDistance: (isHorizontal ? containerRect.width : containerRect.height) * maxDragRatio,
      expandLeft: tabIndex > activeIndex // Expand left/up for tabs after active
    };


    // Setup event listeners
    abortController = new AbortController();
    const opts = { signal: abortController.signal };
    document.addEventListener('pointermove', handlePointerMove, opts);
    document.addEventListener('pointerup', handlePointerUp, opts);
    document.addEventListener('pointercancel', handlePointerUp, opts);

    event.preventDefault();
  };

  const handlePointerMove = event => {
    if (!dragState) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const delta = dragState.isHorizontal ? deltaX : deltaY;
    const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Start dragging after threshold
    if (!dragState.isDragging && totalMovement >= dragThreshold) {
      dragState.isDragging = true;
      container.setAttribute('data-dragging', '');
    }

    if (!dragState.isDragging) return;

    // Check if dragging in correct direction
    const correctDirection = dragState.expandLeft ? delta < 0 : delta > 0;
    const relevantDelta = Math.abs(delta);

    if (correctDirection && relevantDelta > 0) {
      const progress = Math.min(relevantDelta / dragState.maxDistance, 1);

      // Scale expansion for larger buttons
      const buttonWidth = parseFloat(window.getComputedStyle(container).getPropertyValue('--button-width')) || 64;
      const scale = Math.min(2, buttonWidth / 64);
      const maxExpand = 19 / scale;
      const expandAmount = maxExpand * progress;

      // Update grid sizes
      const newSizes = [...dragState.originalSizes];
      newSizes[dragState.activeIndex] = Math.max(1, 20 - expandAmount);
      newSizes[dragState.targetTabIndex] = 1 + expandAmount;

      setGridSizes(newSizes);
      dragState.currentProgress = progress;
    } else {
      setGridSizes(dragState.originalSizes);
      dragState.currentProgress = 0;
    }
  };

  const handlePointerUp = () => {
    if (!dragState) return;

    container.removeAttribute('data-dragging');

    if (dragState.isDragging) {
      preventNextClick = true;
      // Prevent click event from firing
      setTimeout(() => {preventNextClick = false;}, 100);

      if (dragState.currentProgress >= completionThreshold) {
        slideshow.activateTab(dragState.targetTabIndex);
      } else {
        setGridSizes(dragState.originalSizes);
      }
    }

    abortController.abort();
    dragState = null;
  };

  // Add initial listener to container to capture both tabs and virtual button area
  container.addEventListener('pointerdown', handlePointerDown, { signal: abortController.signal });

  // Prevent click events after drag
  const handleClick = event => {
    if (preventNextClick && event.target.closest('[role="tab"]')) {
      event.stopImmediatePropagation();
      event.preventDefault();
      preventNextClick = false;
    }
  };

  // Add click handler with capture to intercept before the web component's handler
  container.addEventListener('click', handleClick, { capture: true, signal: abortController.signal });

  // Return cleanup
  return () => {
    abortController.abort();
    if (dragState) {
      container.removeAttribute('data-dragging');
      dragState = null;
    }
  };
}


const content = [
{
  image: 'https://fastly.picsum.photos/id/1023/1920/1080.jpg?hmac=rlsKP6YbqSnw8h-HfW2RCyu3MKkG90hNhLsOsEuGXj8',
  text: {
    title: 'Timeless bags and modular kits designed for life in motion',
    actions: [
    {
      label: 'Shop Luggage',
      href: '#' },

    {
      label: 'Shop Bags',
      href: '#' }] } },




{
  image: 'https://fastly.picsum.photos/id/685/1920/1080.jpg?hmac=GjjlhGiZFP-hXkJ4S2r2UwMqVqeBH6ky7FAe3DTgrmg',
  text: {
    title: 'Sustainable, innovative design for conscious travelers',
    actions: [
    {
      label: 'Explore Collection',
      href: '#' },

    {
      label: 'Learn More',
      href: '#' }] } },



{
  image: 'https://fastly.picsum.photos/id/633/1920/1080.jpg?hmac=bihVvHUhsF_TR3itiDFvktbq0otiU7aaK2tj8JIiv6Y',
  text: {
    title: 'Crafted for adventure, built to last a lifetime of exploration',
    actions: [
    {
      label: 'Shop Adventure',
      href: '#' },

    {
      label: 'View Stories',
      href: '#' }] } },




{
  image: 'https://fastly.picsum.photos/id/484/1920/1080.jpg?hmac=vmcAj5Ko9XuMClDpoG0f71EbsLLyC70juc3xi9cGnNU',
  text: {
    title: 'Minimalist elegance meets maximum functionality for modern nomads',
    actions: [
    {
      label: 'View Collection',
      href: '#' },

    {
      label: 'Get Inspired',
      href: '#' }] } },




{
  image: 'https://fastly.picsum.photos/id/26/1920/1080.jpg?hmac=YqaJMUjn9yIEP_H9DGKjqf8vh0X-9JF5FOaW64OBp9g',
  text: {
    title: 'Premium materials, thoughtful details, and uncompromising quality',
    actions: [
    {
      label: 'Discover Craftsmanship',
      href: '#' },

    {
      label: 'Shop Premium',
      href: '#' }] } },




{
  image: 'https://fastly.picsum.photos/id/839/1920/1080.jpg?hmac=_ERqXtEbN__CQgZ8C0vKQAK2wV2jZM0VUHUfmkCfGx8',
  text: {
    title: 'Engineered for comfort, designed for style, built for your journey',
    actions: [
    {
      label: 'Shop Now',
      href: '#' },

    {
      label: 'Find Your Perfect Fit',
      href: '#' }] } }];






const buildMarkup = () => {
  const container = document.querySelector('slideshow-stack').firstElementChild;
  container.innerHTML = `
    <div class="slideshow-stack__tablist" role="tablist" aria-label="Featured content">
      ${Array.from({ length: config.panels }).map((_, index) => `
      <div class="slideshow-stack__tablist-item">
        <button role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="panel-${index + 1}" id="tab-${index + 1}" tabindex="${index === 0 ? '0' : '-1'}">
          <span>Tab ${index + 1} Label</span>
        </button>
      </div>
      `).join('')}
    </div>
    <div class="slideshow-stack__panels">
      ${Array.from({ length: config.panels }).map((_, index) => `
        <div role="tabpanel" tabindex="0" id="panel-${index + 1}" aria-labelledby="tab-${index + 1}" ${index === 0 ? 'inert' : ''} inert style="--index: ${index}">
          <div class="slideshow-stack__panel-content">
            <img src="${content[index].image}" alt="${content[index].text.title}" />
            <div class="slide__content">
              <div class="slide-text">
                <p>${content[index].text.title}</p>
                <div class="actions">
                  ${content[index].text.actions.map(action => `
                    <a href="${action.href}">${action.label}</a>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

};


// this one's a late edition but you want to see what happens when you change panel count
ctrl.addBinding(config, 'panels', {
  min: 2,
  max: 6,
  step: 1 }).
on('change', event => {
  if (event.last) {
    buildMarkup();
    slideshow.refresh();
    // Re-initialize grid and drag after refresh
    if (slideshow._initializeSlideshow) {
      slideshow._initializeSlideshow();
    }
  }
});
buildMarkup();
slideshow.refresh();
slideshow._initializeSlideshow();

const removeArrow = () => {
  document.querySelector('.arrow').remove();
  document.removeEventListener('pointerdown', removeArrow);
};

document.addEventListener('pointerdown', removeArrow);