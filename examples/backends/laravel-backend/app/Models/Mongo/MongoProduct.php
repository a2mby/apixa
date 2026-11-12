<?php

namespace App\Models\Mongo;

use MongoDB\Laravel\Eloquent\Model;

class MongoProduct extends Model
{
    protected $connection = 'mongodb';

    protected $table = 'products';

    protected $fillable = ['id', 'workspace_id', 'sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'stock' => 'integer'];
    }
}
