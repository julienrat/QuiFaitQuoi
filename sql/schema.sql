-- Postgres schema for volunteer management

create table if not exists admin_users (
  id serial primary key,
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id serial primary key,
  title text not null,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  theme text not null default 'sand',
  public_token text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  expected_volunteers int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists volunteers (
  id serial primary key,
  event_id int not null references events(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists task_assignments (
  id serial primary key,
  task_id int not null references tasks(id) on delete cascade,
  volunteer_id int not null references volunteers(id) on delete cascade,
  comment text,
  created_at timestamptz not null default now(),
  unique (task_id, volunteer_id)
);

create index if not exists idx_tasks_event_id on tasks(event_id);
create index if not exists idx_volunteers_event_id on volunteers(event_id);
create index if not exists idx_assignments_task_id on task_assignments(task_id);
create index if not exists idx_assignments_volunteer_id on task_assignments(volunteer_id);
