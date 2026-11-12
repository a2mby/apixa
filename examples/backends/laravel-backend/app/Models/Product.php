<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    protected $connection = 'pgsql';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'workspace_id', 'sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'stock' => 'integer', 'active' => 'boolean', 'tags' => 'array', 'attributes' => 'array'];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
