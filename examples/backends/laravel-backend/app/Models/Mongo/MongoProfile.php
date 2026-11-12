<?php

namespace App\Models\Mongo;

use MongoDB\Laravel\Eloquent\Model;

class MongoProfile extends Model
{
    protected $connection = 'mongodb';

    protected $table = 'profiles';

    protected $fillable = ['id', 'contact_id', 'payload', 'workspace_id'];
}
