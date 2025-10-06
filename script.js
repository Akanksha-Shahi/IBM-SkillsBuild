;(() => {

// okay so let's store tasks in localStorage using a namespaced key
const STORAGE_KEY = 'smart-study-planner:v1:tasks'

// shortcut to frequently used DOM elements
const ui = {
addBtn: document.getElementById('addTaskBtn'),
exportBtn: document.getElementById('exportBtn'),
importBtn: document.getElementById('importBtn'),
importFile: document.getElementById('importFile'),
notifyBtn: document.getElementById('notifyPermBtn'),
search: document.getElementById('searchInput'),
subjFilter: document.getElementById('subjectFilter'),
statusFilter: document.getElementById('statusFilter'),
sort: document.getElementById('sortSelect'),
progressTxt: document.getElementById('progressText'),
progressBar: document.getElementById('progressBarFill'),
list: document.getElementById('taskList'),
dialog: document.getElementById('taskDialog'),
dialogClose: document.getElementById('closeDialog'),
form: document.getElementById('taskForm'),
dialogTitle: document.getElementById('taskDialogTitle'),
id: document.getElementById('taskId'),
title: document.getElementById('titleInput'),
subject: document.getElementById('subjectInput'),
dueDate: document.getElementById('dueDateInput'),
dueTime: document.getElementById('dueTimeInput'),
duration: document.getElementById('durationInput'),
priority: document.getElementById('priorityInput'),
notes: document.getElementById('notesInput'),
reminder: document.getElementById('reminderCheckbox'),
deleteBtn: document.getElementById('deleteTaskBtn'),
saveBtn: document.getElementById('saveTaskBtn'),
timeline: document.getElementById('timelineGrid'),
prevWeek: document.getElementById('prevWeek'),
nextWeek: document.getElementById('nextWeek'),
today: document.getElementById('todayBtn')
}

// initial state setup
let tasks = getSavedTasks()
let currentWeekStart = getMonday(new Date())

// just reads from localStorage
function getSavedTasks() {
try {
const stuff = localStorage.getItem(STORAGE_KEY)
if (!stuff) return []
const parsed = JSON.parse(stuff)
return Array.isArray(parsed) ? parsed : []
} catch (err) {
console.warn('could not parse tasks 🤷‍♂️', err)
return []
}
}

// persists everything back into storage
function saveAll() {
localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
render()
}

// quick id generator — not cryptographically strong, but good enough
function makeId() {
return Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}

function startOfDay(d) {
const day = new Date(d)
day.setHours(0,0,0,0)
return day
}

// find the Monday for the week
function getMonday(d) {
const x = startOfDay(d)
const day = x.getDay() // 0 = Sun, 6 = Sat
const diff = (day + 6) % 7
x.setDate(x.getDate() - diff)
return x
}

// helper formatters
function formatDate(ts) {
return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTime(ts) {
return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// opens the modal dialog, optionally editing a task
function openDialog(editing = null) {
if (editing) {
ui.dialogTitle.textContent = 'Edit Task'
ui.id.value = editing.id
ui.title.value = editing.title
ui.subject.value = editing.subject || ''
const due = new Date(editing.dueTs)
ui.dueDate.value = due.toISOString().slice(0,10)
ui.dueTime.value = due.toTimeString().slice(0,5)
ui.duration.value = editing.durationHrs ?? ''
ui.priority.value = String(editing.priority)
ui.notes.value = editing.notes || ''
ui.reminder.checked = !!editing.reminder
ui.deleteBtn.style.display = 'inline-flex'
} else {
ui.dialogTitle.textContent = 'Add Task'
ui.form.reset()
ui.id.value = ''
ui.deleteBtn.style.display = 'none'
ui.dueDate.value = new Date().toISOString().slice(0,10)
}
if (typeof ui.dialog.showModal === 'function') {
  ui.dialog.showModal()
} else {
  alert('Browser too old for <dialog> tag 😬')
}

setTimeout(() => ui.title.focus(), 0)
}

function closeDialog() {
ui.dialog.close()
}

// gather form data and build a task object
function collectFormData() {
const title = ui.title.value.trim()
if (!title) return null
const date = ui.dueDate.value
const time = ui.dueTime.value || '23:59'
const due = new Date(`${date}T${time}:00`).getTime()

return {
  id: ui.id.value || makeId(),
  title,
  subject: ui.subject.value.trim(),
  dueTs: due,
  durationHrs: ui.duration.value ? Number(ui.duration.value) : null,
  priority: Number(ui.priority.value) || 2,
  notes: ui.notes.value.trim(),
  completed: false,
  reminder: !!ui.reminder.checked,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
}

function upsert(task) {
const idx = tasks.findIndex(t => t.id === task.id)
if (idx > -1) {
// keep completion status if already exists
const doneBefore = tasks[idx].completed
tasks[idx] = { ...tasks[idx], ...task, completed: doneBefore, updatedAt: Date.now() }
} else {
tasks.push(task)
}
maybeNotify(task)
saveAll()
}

function remove(id) {
tasks = tasks.filter(t => t.id !== id)
saveAll()
}

function toggleDone(id, done) {
const found = tasks.find(x => x.id === id)
if (!found) return
found.completed = done
found.updatedAt = Date.now()
saveAll()
}

// apply filters and sorting
function getVisibleTasks() {
const q = ui.search.value.trim().toLowerCase()
const subj = ui.subjFilter.value.trim().toLowerCase()
const status = ui.statusFilter.value
const sort = ui.sort.value
let list = [...tasks]
if (q) list = list.filter(t => (t.title + ' ' + (t.notes || '')).toLowerCase().includes(q))
if (subj) list = list.filter(t => (t.subject || '').toLowerCase().includes(subj))

const now = Date.now()
if (status === 'pending') list = list.filter(t => !t.completed)
if (status === 'completed') list = list.filter(t => t.completed)
if (status === 'overdue') list = list.filter(t => !t.completed && t.dueTs < now)

const sorts = {
  dueAsc: (a,b) => a.dueTs - b.dueTs,
  dueDesc: (a,b) => b.dueTs - a.dueTs,
  priorityDesc: (a,b) => b.priority - a.priority || a.dueTs - b.dueTs,
  priorityAsc: (a,b) => a.priority - b.priority || a.dueTs - b.dueTs,
  titleAsc: (a,b) => a.title.localeCompare(b.title),
  titleDesc: (a,b) => b.title.localeCompare(a.title),
}

list.sort(sorts[sort] || sorts.dueAsc)
return list
}

// make one task item DOM node
function makeTaskItem(task) {
const tpl = document.getElementById('taskItemTemplate')
const el = tpl.content.firstElementChild.cloneNode(true)
el.dataset.id = task.id
el.querySelector('.title').textContent = task.title
el.querySelector('.due').textContent = `${formatDate(task.dueTs)} · ${formatTime(task.dueTs)}`
el.querySelector('.duration').textContent = task.durationHrs ? `${task.durationHrs}h` : ''
el.querySelector('.badge.subject').textContent = task.subject || 'General'
const prio = el.querySelector('.badge.priority')
prio.textContent = task.priority === 3 ? 'High' : task.priority === 2 ? 'Medium' : 'Low'
prio.classList.toggle('high', task.priority === 3)
prio.classList.toggle('low', task.priority === 1)
el.querySelector('.notes').textContent = task.notes || ''

const now = Date.now()
el.classList.toggle('overdue', !task.completed && task.dueTs < now)
el.classList.toggle('completed', task.completed)
el.querySelector('.complete-toggle').checked = !!task.completed

// event handlers
el.querySelector('.del-btn').addEventListener('click', () => remove(task.id))
el.querySelector('.edit-btn').addEventListener('click', () => openDialog(task))
el.querySelector('.complete-toggle').addEventListener('change', e => toggleDone(task.id, e.target.checked))

return el
}

function renderList() {
const list = getVisibleTasks()
ui.list.innerHTML = ''
const frag = document.createDocumentFragment()
list.forEach(t => frag.appendChild(makeTaskItem(t)))
ui.list.appendChild(frag)
const total = tasks.length
const done = tasks.filter(t => t.completed).length
ui.progressTxt.textContent = `${done} of ${total} completed`
ui.progressBar.style.width = total ? `${Math.round(done / total * 100)}%` : '0%'
}

function renderTimeline() {
const weekDays = []
for (let i = 0; i < 7; i++) {
const d = new Date(currentWeekStart)
d.setDate(d.getDate() + i)
weekDays.push(d)
}
const byDate = new Map()
for (const t of tasks) {
  const key = startOfDay(new Date(t.dueTs)).getTime()
  const arr = byDate.get(key) || []
  arr.push(t)
  byDate.set(key, arr)
}

const wrapper = document.createElement('div')
wrapper.className = 'week'

weekDays.forEach(d => {
  const day = document.createElement('div')
  day.className = 'day'
  const dateKey = startOfDay(d).getTime()
  const items = (byDate.get(dateKey) || []).sort((a,b) => b.priority - a.priority)

  const dateEl = document.createElement('div')
  dateEl.className = 'date'
  dateEl.textContent = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  day.appendChild(dateEl)

  const chips = document.createElement('div')
  chips.className = 'chips'
  items.forEach(t => {
    const chip = document.createElement('div')
    chip.className = 'chip' + (t.priority === 3 ? ' high' : t.priority === 1 ? ' low' : '')
    chip.textContent = `${t.title} · ${t.durationHrs ? t.durationHrs + 'h · ' : ''}${new Date(t.dueTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    chip.title = t.notes || ''
    chip.addEventListener('click', () => openDialog(t))
    chips.appendChild(chip)
  })
  day.appendChild(chips)
  wrapper.appendChild(day)
})

ui.timeline.innerHTML = ''
ui.timeline.appendChild(wrapper)
}

function render() {
renderList()
renderTimeline()
}

// schedule a lightweight reminder (works only while tab is open)
function maybeNotify(task) {
if (!('Notification' in window) || !task.reminder || Notification.permission !== 'granted') return
const remindAt = task.dueTs - 30 * 60 * 1000
const delay = remindAt - Date.now()
if (delay <= 0) return
setTimeout(() => {
  new Notification('Upcoming study task', {
    body: `${task.title} at ${formatTime(task.dueTs)} (${formatDate(task.dueTs)})`,
    silent: false
  })
}, Math.min(delay, 2 ** 31 - 1))
}

// ==== EVENT HOOKS ====

ui.addBtn.addEventListener('click', () => openDialog())
ui.dialogClose.addEventListener('click', closeDialog)

document.addEventListener('keydown', e => {
if (e.key === 'Escape' && ui.dialog.open) {
e.stopPropagation()
closeDialog()
}
})

ui.form.addEventListener('submit', e => {
e.preventDefault()
const t = collectFormData()
if (!t) return
upsert(t)
closeDialog()
})

ui.deleteBtn.addEventListener('click', () => {
const id = ui.id.value
if (!id) return
remove(id)
closeDialog()
})

;['input','change','keyup'].forEach(evt => {
ui.search.addEventListener(evt, renderList)
ui.subjFilter.addEventListener(evt, renderList)
})
ui.statusFilter.addEventListener('change', renderList)
ui.sort.addEventListener('change', renderList)

ui.prevWeek.addEventListener('click', () => { currentWeekStart.setDate(currentWeekStart.getDate() - 7); renderTimeline() })
ui.nextWeek.addEventListener('click', () => { currentWeekStart.setDate(currentWeekStart.getDate() + 7); renderTimeline() })
ui.today.addEventListener('click', () => { currentWeekStart = getMonday(new Date()); renderTimeline() })

ui.exportBtn.addEventListener('click', () => {
const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' })
const link = document.createElement('a')
link.href = URL.createObjectURL(blob)
link.download = 'smart-study-planner-tasks.json'
document.body.appendChild(link)
link.click()
link.remove()
URL.revokeObjectURL(link.href)
})

ui.importBtn.addEventListener('click', () => ui.importFile.click())
ui.importFile.addEventListener('change', async e => {
const file = e.target.files && e.target.files[0]
if (!file) return
try {
const text = await file.text()
const data = JSON.parse(text)
if (!Array.isArray(data)) throw new Error('Invalid file format')
tasks = data.filter(Boolean)
saveAll()
} catch (err) {
alert('Import failed: ' + (err?.message || 'Unknown issue'))
} finally {
e.target.value = ''
}
})

ui.notifyBtn.addEventListener('click', async () => {
if (!('Notification' in window)) {
alert('Notifications not supported here.')
return
}
if (Notification.permission === 'granted') {
alert('Already enabled!')
return
}
try {
const perm = await Notification.requestPermission()
if (perm === 'granted') {
alert('Sweet — reminders will show 30 mins before due time (if tab open).')
tasks.filter(t => t.reminder).forEach(maybeNotify)
} else {
alert('Permission denied or skipped.')
}
} catch (e) {
console.error(e)
}
})

// initial boot
render()
tasks.filter(t => t.reminder).forEach(maybeNotify)

})()