<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Profile extends Model
{
    protected $connection = 'pgsql';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'contact_id', 'payload'];

    protected function casts(): array
    {
        return ['payload' => 'object'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }
}
