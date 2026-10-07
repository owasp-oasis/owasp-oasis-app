ConfirmDialog — required before Leave team, Remove member, Offer ownership, Archive team and Reactivate team. Cancel gets focus; Esc cancels.
```jsx
<ConfirmDialog open title="Archive this team?" explanation="The team’s members, repositories, and history will be preserved." confirmLabel="Archive team" danger onConfirm={archive} onCancel={close}/>
```
