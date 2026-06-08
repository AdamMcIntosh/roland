(function () {
  'use strict';

  const STORAGE_KEY = 'roland-todo-app:v1';

  /** @type {'all' | 'active' | 'completed'} */
  let currentFilter = 'all';

  /** @type {Array<{ id: string; text: string; completed: boolean; createdAt: number }>} */
  let todos = [];

  const form = document.getElementById('todo-form');
  const input = document.getElementById('todo-input');
  const list = document.getElementById('todo-list');
  const emptyState = document.getElementById('empty-state');
  const todoCount = document.getElementById('todo-count');
  const clearCompletedBtn = document.getElementById('clear-completed');
  const filterButtons = document.querySelectorAll('.filter-btn');

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function isValidTodo(value) {
    return (
      value &&
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      typeof value.text === 'string' &&
      typeof value.completed === 'boolean' &&
      typeof value.createdAt === 'number'
    );
  }

  function loadTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isValidTodo);
    } catch {
      return [];
    }
  }

  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'Storage is full. Remove some todos and try again.'
          : 'Could not save todos. Your changes may not persist.';
      window.alert(message);
    }
  }

  function getVisibleTodos() {
    if (currentFilter === 'active') {
      return todos.filter((todo) => !todo.completed);
    }
    if (currentFilter === 'completed') {
      return todos.filter((todo) => todo.completed);
    }
    return todos;
  }

  function updateCount() {
    const activeCount = todos.filter((todo) => !todo.completed).length;
    const label = activeCount === 1 ? '1 item left' : `${activeCount} items left`;
    todoCount.textContent = label;

    const completedCount = todos.length - activeCount;
    clearCompletedBtn.hidden = completedCount === 0;
  }

  function render() {
    const visibleTodos = getVisibleTodos();
    list.replaceChildren();

    visibleTodos.forEach((todo) => {
      const item = document.createElement('li');
      item.className = 'todo-item';
      if (todo.completed) {
        item.classList.add('todo-item--completed');
      }
      item.dataset.id = todo.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-item__checkbox';
      checkbox.checked = todo.completed;
      checkbox.setAttribute('aria-label', `Mark "${todo.text}" as ${todo.completed ? 'incomplete' : 'complete'}`);
      checkbox.addEventListener('change', () => toggleTodo(todo.id));

      const text = document.createElement('span');
      text.className = 'todo-item__text';
      text.textContent = todo.text;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'todo-item__remove';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove "${todo.text}"`);
      removeBtn.addEventListener('click', () => removeTodo(todo.id));

      item.append(checkbox, text, removeBtn);
      list.appendChild(item);
    });

    const showEmptyState = todos.length === 0 || visibleTodos.length === 0;
    emptyState.hidden = !showEmptyState;
    if (todos.length === 0) {
      emptyState.textContent = 'No todos yet. Add one above.';
    } else if (visibleTodos.length === 0) {
      emptyState.textContent = 'No todos match this filter.';
    }

    updateCount();
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    todos.unshift({
      id: createId(),
      text: trimmed,
      completed: false,
      createdAt: Date.now(),
    });

    saveTodos();
    render();
  }

  function removeTodo(id) {
    todos = todos.filter((todo) => todo.id !== id);
    saveTodos();
    render();
  }

  function toggleTodo(id) {
    todos = todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    saveTodos();
    render();
  }

  function clearCompleted() {
    todos = todos.filter((todo) => !todo.completed);
    saveTodos();
    render();
  }

  function setFilter(filter) {
    currentFilter = filter;
    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle('filter-btn--active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    render();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    addTodo(input.value);
    input.value = '';
    input.focus();
  });

  clearCompletedBtn.addEventListener('click', clearCompleted);

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      if (filter === 'all' || filter === 'active' || filter === 'completed') {
        setFilter(filter);
      }
    });
  });

  todos = loadTodos();
  setFilter('all');
})();
