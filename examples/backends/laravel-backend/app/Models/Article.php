<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Article extends Model
{
    protected $connection = 'pgsql';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'workspace_id', 'contact_id', 'slug', 'title', 'status', 'body', 'published_at', 'rank', 'metadata'];

    protected function casts(): array
    {
        return ['rank' => 'integer', 'metadata' => 'array', 'published_at' => 'immutable_datetime'];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }
}
