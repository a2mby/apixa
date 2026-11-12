<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected $connection = 'pgsql';

    public function up(): void
    {
        Schema::create('workspaces', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->timestampsTz();
        });
        Schema::create('contacts', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('email')->unique();
            $table->boolean('active');
            $table->string('nickname')->nullable();
            $table->integer('score');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->unique(['id', 'workspace_id']);
            $table->index(['workspace_id', 'active', 'id']);
        });
        Schema::create('numeric_records', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('workspace_id');
            $table->string('label');
            $table->integer('value');
            $table->boolean('enabled');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
        });
        Schema::create('uuid_records', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('workspace_id');
            $table->string('label');
            $table->integer('value');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
        });
        Schema::create('articles', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->string('contact_id');
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('status');
            $table->text('body');
            $table->timestampTz('published_at')->nullable();
            $table->integer('rank');
            $table->jsonb('metadata');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->foreign(['contact_id', 'workspace_id'])->references(['id', 'workspace_id'])->on('contacts')->restrictOnDelete();
            $table->index(['workspace_id', 'status', 'rank', 'id']);
        });
        Schema::create('comments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('article_id');
            $table->string('contact_id');
            $table->text('body');
            $table->boolean('approved');
            $table->timestampsTz();
            $table->foreign('article_id')->references('id')->on('articles')->restrictOnDelete();
            $table->foreign('contact_id')->references('id')->on('contacts')->restrictOnDelete();
            $table->index(['article_id', 'id']);
        });
        Schema::create('products', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->string('sku')->unique();
            $table->string('slug')->unique();
            $table->string('name');
            $table->string('category');
            $table->decimal('price', 12, 2);
            $table->unsignedInteger('stock');
            $table->boolean('active');
            $table->jsonb('tags');
            $table->jsonb('attributes');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->index(['workspace_id', 'category', 'id']);
        });
        Schema::create('profiles', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('contact_id')->unique();
            $table->jsonb('payload');
            $table->timestampsTz();
            $table->foreign('contact_id')->references('id')->on('contacts')->restrictOnDelete();
        });
        Schema::create('documents', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->string('contact_id');
            $table->string('title');
            $table->string('disk');
            $table->string('path');
            $table->string('original_name');
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->string('sha256', 64);
            $table->string('fixture_key');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->foreign(['contact_id', 'workspace_id'])->references(['id', 'workspace_id'])->on('contacts')->restrictOnDelete();
            $table->index(['workspace_id', 'id']);
        });
        Schema::create('document_links', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('document_id');
            $table->string('contact_id');
            $table->string('label');
            $table->timestampsTz();
            $table->foreign('document_id')->references('id')->on('documents')->restrictOnDelete();
            $table->foreign('contact_id')->references('id')->on('contacts')->restrictOnDelete();
            $table->unique(['document_id', 'contact_id']);
        });
        Schema::create('tasks', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->string('contact_id');
            $table->string('title');
            $table->string('status');
            $table->unsignedInteger('version');
            $table->unsignedInteger('priority');
            $table->jsonb('metadata');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
            $table->foreign(['contact_id', 'workspace_id'])->references(['id', 'workspace_id'])->on('contacts')->restrictOnDelete();
            $table->index(['workspace_id', 'status', 'id']);
        });
        Schema::create('counters', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('workspace_id');
            $table->bigInteger('value');
            $table->unsignedInteger('version');
            $table->timestampsTz();
            $table->foreign('workspace_id')->references('id')->on('workspaces')->restrictOnDelete();
        });
        // GIN supports nested containment queries without replacing normal relational indexes.
        foreach (['profiles' => 'payload', 'products' => 'attributes', 'articles' => 'metadata'] as $table => $column) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->rawIndex("\"$column\" jsonb_path_ops", "{$table}_{$column}_gin")->algorithm('gin'));
        }
    }

    public function down(): void
    {
        foreach (['counters', 'tasks', 'document_links', 'documents', 'profiles', 'products', 'comments', 'articles', 'uuid_records', 'numeric_records', 'contacts', 'workspaces'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
