// Presentation hooks for the original F interface; transport and submission stay shared.
const picker = document.getElementById('classic-amount-editor');
const selectedAmount = document.getElementById('selected-amount');
const syncAmount = () => {
  const selection = picker.querySelector('input[name="amount_band"]:checked');
  if (selection) selectedAmount.textContent = selection.value;
};
document.addEventListener('DOMContentLoaded', syncAmount, { once: true });
document.addEventListener('click', event => {
  if (event.target.closest('#apply')) { syncAmount(); picker.open = false; }
});
picker.addEventListener('change', event => {
  if (event.target.name !== 'amount_band') return;
  syncAmount();
  picker.open = false;
  picker.querySelector('summary').focus({ preventScroll: true });
});

const terms = document.querySelector('.term-grid');
terms.addEventListener('click', event => {
  const option = event.target.closest('button[data-term]');
  if (!option) return;
  const radio = terms.querySelector(`input[value="${option.dataset.term}"]`);
  if (!radio) return;
  radio.checked = true;
  for (const button of terms.querySelectorAll('button[data-term]')) {
    button.classList.toggle('selected', button === option);
    button.setAttribute('aria-pressed', String(button === option));
  }
  terms.dispatchEvent(new Event('change', { bubbles: true }));
});

document.getElementById('classic-purposes').addEventListener('click', event => {
  const option = event.target.closest('button');
  if (!option) return;
  const list = option.parentElement;
  for (const button of list.querySelectorAll('button')) {
    button.classList.toggle('selected', button === option);
    button.setAttribute('aria-pressed', String(button === option));
  }
  document.getElementById('purpose-value').textContent = option.textContent;
  const details = list.closest('details');
  details.open = false;
  details.querySelector('summary').focus({ preventScroll: true });
});
