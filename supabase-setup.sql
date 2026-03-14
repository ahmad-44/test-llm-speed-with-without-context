-- Run this in your Supabase SQL editor

create extension if not exists vector;

-- Intent classes
create table if not exists intent_classes (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  description text,
  color text default '#7c6af7',
  created_at timestamptz default now()
);

-- Intent examples with embeddings
create table if not exists intent_examples (
  id uuid default gen_random_uuid() primary key,
  class_name text not null references intent_classes(name) on delete cascade,
  message text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Index for fast similarity search
create index if not exists intent_examples_embedding_idx
  on intent_examples using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Similarity search function
create or replace function match_intent(
  query_embedding vector(1536),
  match_count int default 10
)
returns table (
  class_name text,
  message text,
  similarity float
)
language sql stable
as $$
  select
    class_name,
    message,
    1 - (embedding <=> query_embedding) as similarity
  from intent_examples
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
