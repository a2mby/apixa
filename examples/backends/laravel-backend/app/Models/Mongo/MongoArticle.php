<?php

namespace App\Models\Mongo;

use MongoDB\Laravel\Eloquent\Model;

class MongoArticle extends Model
{
    protected $connection = 'mongodb';

    protected $table = 'articles';

    protected $fillable = ['id', 'workspace_id', 'contact_id', 'slug', 'title', 'status', 'body', 'published_at', 'rank', 'metadata', 'comments'];

    protected function casts(): array
    {
        return ['published_at' => 'immutable_datetime'];
    }
}
